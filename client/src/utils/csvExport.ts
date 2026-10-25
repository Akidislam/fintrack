import type { Transaction, Account } from '../types';

/**
 * Escapes a single value according to RFC 4180 CSV standard:
 * - If value contains a comma, double-quote, or newline, wrap in quotes.
 * - Any double-quote characters inside the value are doubled ("").
 */
export function escapeCSVField(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * Converts a list of transactions and account relationships into an RFC 4180 compliant CSV string.
 * Uses '\r\n' line breaks for standard spreadsheet cross-compatibility.
 */
export function transactionsToCSV(
  transactions: Transaction[],
  accounts: Account[]
): string {
  const headers = [
    'Date',
    'Type',
    'Title',
    'Category',
    'Amount',
    'Account',
    'Transfer Source',
    'Transfer Destination',
    'Note',
  ];

  const accountMap = new Map<string, Account>();
  for (const acc of accounts) {
    accountMap.set(acc.id, acc);
  }

  const rows = transactions.map((tx) => {
    const typeLabel = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);
    const fromAccount = tx.accountId ? accountMap.get(tx.accountId) : undefined;
    const toAccount = tx.toAccountId ? accountMap.get(tx.toAccountId) : undefined;

    let accountCol = '';
    let transferSourceCol = '';
    let transferDestCol = '';

    if (tx.type === 'transfer') {
      transferSourceCol = fromAccount
        ? fromAccount.name
        : tx.accountId
        ? 'Deleted Account'
        : 'Unassigned';
      transferDestCol = toAccount
        ? toAccount.name
        : tx.toAccountId
        ? 'Deleted Account'
        : 'Unassigned';
    } else {
      accountCol = fromAccount
        ? fromAccount.name
        : tx.accountId
        ? 'Deleted Account'
        : 'Unassigned';
    }

    const fields = [
      tx.date,
      typeLabel,
      tx.title,
      tx.category,
      tx.amount.toFixed(2),
      accountCol,
      transferSourceCol,
      transferDestCol,
      tx.note || '',
    ];

    return fields.map(escapeCSVField).join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Formats current or specified date into filename `fintrack-transactions-YYYY-MM-DD.csv`.
 */
export function generateTransactionsFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `fintrack-transactions-${year}-${month}-${day}.csv`;
}

/**
 * Initiates browser file download for CSV content using UTF-8 BOM encoding for Excel compatibility.
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

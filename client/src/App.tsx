import { useState, useEffect } from 'react';
import './App.css';
import type { Transaction, FinancialSummary, CategoryBudget, TransactionCategory, SupportedCurrency } from './types';
import { INITIAL_TRANSACTIONS, INITIAL_BUDGETS } from './data/mockData';
import { Sidebar } from './components/Sidebar';
import { SummaryCards } from './components/SummaryCards';
import { TransactionList } from './components/TransactionList';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AccountsPage } from './components/AccountsPage';
import { TransactionsPage } from './components/TransactionsPage';
import { BudgetsPage } from './components/BudgetsPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { SettingsPage } from './components/SettingsPage';

export function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('fintrack_transactions');
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });

  const [budgets, setBudgets] = useState<CategoryBudget[]>(() => {
    const saved = localStorage.getItem('fintrack_budgets');
    return saved ? JSON.parse(saved) : INITIAL_BUDGETS;
  });

  const [currency, setCurrency] = useState<SupportedCurrency>(() => {
    const saved = localStorage.getItem('fintrack_currency');
    return (saved as SupportedCurrency) || 'USD';
  });

  const [activeNav, setActiveNav] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Sync transactions to localStorage for persistent session testing
  useEffect(() => {
    localStorage.setItem('fintrack_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // Sync budgets to localStorage
  useEffect(() => {
    localStorage.setItem('fintrack_budgets', JSON.stringify(budgets));
  }, [budgets]);

  // Sync currency preference to localStorage
  useEffect(() => {
    localStorage.setItem('fintrack_currency', currency);
  }, [currency]);

  // Check Express backend health check endpoint
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('http://localhost:5000/api/health', {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          setApiStatus('online');
        } else {
          setApiStatus('offline');
        }
      } catch {
        setApiStatus('offline');
      }
    };

    checkBackend();
  }, []);

  // Compute live summary metrics
  const summary: FinancialSummary = transactions.reduce(
    (acc, tx) => {
      if (tx.type === 'income') {
        acc.totalIncome += tx.amount;
      } else {
        acc.totalExpenses += tx.amount;
      }
      return acc;
    },
    {
      totalIncome: 0,
      totalExpenses: 0,
      totalBalance: 0,
      savingsRate: 0,
    }
  );

  summary.totalBalance = summary.totalIncome - summary.totalExpenses;
  summary.savingsRate =
    summary.totalIncome > 0
      ? Math.max(0, ((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100)
      : 0;

  // Add new transaction handler
  const handleAddTransaction = (newTxData: Omit<Transaction, 'id'>) => {
    const newTx: Transaction = {
      ...newTxData,
      id: `tx-${Date.now()}`,
    };
    setTransactions((prev) => [newTx, ...prev]);
  };

  // Delete transaction handler
  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  };

  // Add / update budget handler
  const handleSaveBudget = (
    category: TransactionCategory,
    monthlyLimit: number,
    editId?: string
  ) => {
    setBudgets((prev) => {
      if (editId) {
        return prev.map((b) =>
          b.id === editId ? { ...b, category, monthlyLimit } : b
        );
      }
      const existing = prev.find((b) => b.category === category);
      if (existing) {
        return prev.map((b) =>
          b.id === existing.id ? { ...b, monthlyLimit } : b
        );
      }
      return [...prev, { id: `b-${Date.now()}`, category, monthlyLimit }];
    });
  };

  // Remove budget handler
  const handleRemoveBudget = (id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  // Quick reset to initial mock data
  const handleResetData = () => {
    setTransactions(INITIAL_TRANSACTIONS);
    setBudgets(INITIAL_BUDGETS);
    setCurrency('USD');
    localStorage.removeItem('fintrack_transactions');
    localStorage.removeItem('fintrack_budgets');
    localStorage.removeItem('fintrack_currency');
  };

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Navigation Bar */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="hamburger-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="greeting-block">
              <h1 className="greeting-title">
                {activeNav === 'dashboard' && 'FinTrack Dashboard'}
                {activeNav === 'accounts' && 'Accounts'}
                {activeNav === 'transactions' && 'Transactions'}
                {activeNav === 'budgets' && 'Budgets'}
                {activeNav === 'analytics' && 'Analytics'}
                {activeNav === 'settings' && 'Settings'}
              </h1>
              <p className="greeting-subtitle">
                {activeNav === 'dashboard' && 'Track your wealth, monthly cash flow, and spending habits.'}
                {activeNav === 'accounts' && 'Manage your financial accounts and institution connections.'}
                {activeNav === 'transactions' && 'View, search, and manage all recorded transactions.'}
                {activeNav === 'budgets' && 'Set spending limits and monitor budget categories.'}
                {activeNav === 'analytics' && 'Gain insights into your spending habits and financial trends.'}
                {activeNav === 'settings' && 'Configure preferences and system options.'}
              </p>
            </div>
          </div>

          <div className="topbar-right">
            {/* Backend API status indicator */}
            <div className="api-badge-wrap" title="Express backend on port 5000">
              <span
                className={`api-indicator-dot ${
                  apiStatus === 'online' ? 'online' : apiStatus === 'offline' ? 'offline' : 'checking'
                }`}
              />
              <span className="api-badge-text">
                {apiStatus === 'online'
                  ? 'API: Connected'
                  : apiStatus === 'offline'
                  ? 'Local Mode'
                  : 'Checking API...'}
              </span>
            </div>

            <button className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add Transaction</span>
            </button>
          </div>
        </header>

        {/* Dashboard Content Container */}
        <div className="dashboard-body">
          {activeNav === 'dashboard' && (
            <>
              {/* Financial Summary Cards */}
              <SummaryCards summary={summary} currency={currency} />

              {/* Recent Transactions List with Filters & Search */}
              <TransactionList
                transactions={transactions}
                onDeleteTransaction={handleDeleteTransaction}
                onOpenAddModal={() => setIsAddModalOpen(true)}
                currency={currency}
              />
            </>
          )}

          {activeNav === 'accounts' && <AccountsPage />}

          {activeNav === 'transactions' && (
            <TransactionsPage transactions={transactions} currency={currency} />
          )}

          {activeNav === 'budgets' && (
            <BudgetsPage
              budgets={budgets}
              transactions={transactions}
              onSaveBudget={handleSaveBudget}
              onRemoveBudget={handleRemoveBudget}
              currency={currency}
            />
          )}

          {activeNav === 'analytics' && (
            <AnalyticsPage transactions={transactions} currency={currency} />
          )}

          {activeNav === 'settings' && (
            <SettingsPage
              currency={currency}
              onCurrencyChange={setCurrency}
              transactionsCount={transactions.length}
              budgetsCount={budgets.length}
              onResetData={handleResetData}
            />
          )}

          {/* Footer with Reset Sample Data option */}
          <footer className="dashboard-footer">
            <span className="footer-note">
              FinTrack v1.0 • Running client on Vite + React + TypeScript
            </span>
            <button className="reset-data-btn" onClick={handleResetData}>
              Reset Sample Data
            </button>
          </footer>
        </div>
      </main>

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddTransaction={handleAddTransaction}
        currency={currency}
      />
    </div>
  );
}

export default App;

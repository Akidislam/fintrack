import { useState, useEffect } from 'react';
import './App.css';
import type { Transaction, FinancialSummary, CategoryBudget, TransactionCategory, SupportedCurrency, Account } from './types';
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
import { getNavFromLocation, getPathForNav, isValidNavPage, type NavPage } from './utils/navigation';

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

  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const saved = localStorage.getItem('fintrack_accounts');
      return saved ? (JSON.parse(saved) as Account[]) : [];
    } catch {
      return [];
    }
  });

  const [activeNav, setActiveNav] = useState<NavPage>(() => getNavFromLocation());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Handle user navigation (updates state, browser history URL, and localStorage)
  const handleNavigate = (nav: string) => {
    if (!isValidNavPage(nav)) return;
    if (nav === activeNav) return;

    setActiveNav(nav);
    localStorage.setItem('fintrack_active_nav', nav);

    const targetPath = getPathForNav(nav);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ nav }, '', targetPath);
    }
  };

  // Sync state with browser back / forward navigation
  useEffect(() => {
    const handlePopState = (e: Event) => {
      const popStateEvent = e as PopStateEvent;
      const pageFromState = popStateEvent.state?.nav;
      if (isValidNavPage(pageFromState)) {
        setActiveNav(pageFromState);
        localStorage.setItem('fintrack_active_nav', pageFromState);
      } else {
        const pageFromLocation = getNavFromLocation();
        setActiveNav(pageFromLocation);
        localStorage.setItem('fintrack_active_nav', pageFromLocation);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Normalize initial history state entry and sync URL with current page
  useEffect(() => {
    const targetPath = getPathForNav(activeNav);
    if (window.location.pathname !== targetPath && !window.location.hash && !window.location.search) {
      window.history.replaceState({ nav: activeNav }, '', targetPath);
    } else if (!window.history.state || window.history.state.nav !== activeNav) {
      window.history.replaceState({ nav: activeNav }, '', window.location.pathname);
    }
    localStorage.setItem('fintrack_active_nav', activeNav);
  }, [activeNav]);

  // Synchronize browser document title
  useEffect(() => {
    const pageTitles: Record<NavPage, string> = {
      dashboard: 'FinTrack Dashboard',
      accounts: 'Accounts | FinTrack',
      transactions: 'Transactions | FinTrack',
      budgets: 'Budgets | FinTrack',
      analytics: 'Analytics | FinTrack',
      settings: 'Settings | FinTrack',
    };
    document.title = pageTitles[activeNav] || 'FinTrack';
  }, [activeNav]);

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

  // Sync accounts to localStorage
  useEffect(() => {
    localStorage.setItem('fintrack_accounts', JSON.stringify(accounts));
  }, [accounts]);

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
  // Note: Transfers do not count as income or expense
  const summary: FinancialSummary = transactions.reduce(
    (acc, tx) => {
      if (tx.type === 'income') {
        acc.totalIncome += tx.amount;
      } else if (tx.type === 'expense') {
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

  // Add / Edit transaction handler
  const handleSaveTransaction = (
    txData: Omit<Transaction, 'id'>,
    editId?: string
  ) => {
    if (editId) {
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === editId ? { ...txData, id: editId } : tx))
      );
    } else {
      const newTx: Transaction = {
        ...txData,
        id: `tx-${Date.now()}`,
      };
      setTransactions((prev) => [newTx, ...prev]);
    }
  };

  const handleOpenAddModal = () => {
    setEditingTransaction(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (tx: Transaction) => {
    setEditingTransaction(tx);
    setIsAddModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setEditingTransaction(null);
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

  // Add account handler
  const handleAddAccount = (data: Omit<Account, 'id' | 'createdAt'>) => {
    const newAccount: Account = {
      ...data,
      id: `acct-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setAccounts((prev) => [newAccount, ...prev]);
  };

  // Edit account handler
  const handleEditAccount = (data: Omit<Account, 'id' | 'createdAt'>, editId: string) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === editId ? { ...a, ...data } : a
      )
    );
  };

  // Delete account handler
  const handleDeleteAccount = (id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  // Quick reset to initial mock data
  const handleResetData = () => {
    setTransactions(INITIAL_TRANSACTIONS);
    setBudgets(INITIAL_BUDGETS);
    setAccounts([]);
    setCurrency('USD');
    localStorage.removeItem('fintrack_transactions');
    localStorage.removeItem('fintrack_budgets');
    localStorage.removeItem('fintrack_accounts');
    localStorage.removeItem('fintrack_currency');
  };

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeNav={activeNav}
        setActiveNav={handleNavigate}
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
                {activeNav === 'accounts' && 'Manage your financial accounts and real-time balances.'}
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
                className={`api-indicator-dot ${apiStatus === 'online' ? 'online' : apiStatus === 'offline' ? 'offline' : 'checking'
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

            <button className="btn-primary" onClick={handleOpenAddModal}>
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
                accounts={accounts}
                onDeleteTransaction={handleDeleteTransaction}
                onEditTransaction={handleOpenEditModal}
                onOpenAddModal={handleOpenAddModal}
                currency={currency}
              />
            </>
          )}

          {activeNav === 'accounts' && (
            <AccountsPage
              accounts={accounts}
              transactions={transactions}
              onAddAccount={handleAddAccount}
              onEditAccount={handleEditAccount}
              onDeleteAccount={handleDeleteAccount}
              currency={currency}
            />
          )}

          {activeNav === 'transactions' && (
            <TransactionsPage
              transactions={transactions}
              accounts={accounts}
              onEditTransaction={handleOpenEditModal}
              onDeleteTransaction={handleDeleteTransaction}
              currency={currency}
            />
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
              accountsCount={accounts.length}
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

      {/* Add / Edit Transaction Modal */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={handleCloseModal}
        onSaveTransaction={handleSaveTransaction}
        existingTransaction={editingTransaction}
        accounts={accounts}
        currency={currency}
      />
    </div>
  );
}

export default App;

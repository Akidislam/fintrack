import { useState, useEffect, useCallback } from 'react';
import './App.css';
import type {
  Transaction,
  FinancialSummary,
  CategoryBudget,
  TransactionCategory,
  SupportedCurrency,
  Account,
  Category,
  User,
} from './types';
import { api, ApiError, type CreateCategoryInput } from './services/api';
import { AuthPage } from './components/AuthPage';
import { Sidebar } from './components/Sidebar';
import { SummaryCards } from './components/SummaryCards';
import { TransactionList } from './components/TransactionList';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AccountsPage } from './components/AccountsPage';
import { TransactionsPage } from './components/TransactionsPage';
import { CategoriesPage } from './components/CategoriesPage';
import { BudgetsPage } from './components/BudgetsPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { SettingsPage } from './components/SettingsPage';
import { getNavFromLocation, getPathForNav, isValidNavPage, type NavPage } from './utils/navigation';
import { calculateTotalNetWorth } from './utils/accountUtils';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  try {
    return localStorage.getItem('fintrack_theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Financial state starts strictly empty for authenticated users
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState(false);
  const [budgetsError, setBudgetsError] = useState<string | null>(null);

  // Accounts state is strictly sourced from backend API (no stale localStorage fallback)
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [currency, setCurrency] = useState<SupportedCurrency>(() => {
    const saved = localStorage.getItem('fintrack_currency');
    return (saved as SupportedCurrency) || 'USD';
  });

  const [activeNav, setActiveNav] = useState<NavPage>(() => getNavFromLocation());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('fintrack_theme', theme);
    } catch {
      // The current in-memory selection still applies when storage is unavailable.
    }
  }, [theme]);

  // Fetch latest transactions from backend API
  const loadTransactions = useCallback(async () => {
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      const data = await api.getTransactions();
      setTransactions(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCurrentUser(null);
        setAccounts([]);
        setTransactions([]);
        setBudgets([]);
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load transactions from server';
      setTransactionsError(message);
    } finally {
      setTransactionsLoading(false);
    }
  }, []);

  // Fetch latest accounts from backend API
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCurrentUser(null);
        setAccounts([]);
        setTransactions([]);
        setBudgets([]);
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load accounts from server';
      setAccountsError(message);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  // Fetch categories from backend API
  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCurrentUser(null);
        setAccounts([]);
        setTransactions([]);
        setBudgets([]);
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load categories from server';
      setCategoriesError(message);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  // Fetch latest budgets from backend API
  const loadBudgets = useCallback(async () => {
    setBudgetsLoading(true);
    setBudgetsError(null);
    try {
      const data = await api.getBudgets();
      setBudgets(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCurrentUser(null);
        setAccounts([]);
        setTransactions([]);
        setBudgets([]);
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load budgets from server';
      setBudgetsError(message);
    } finally {
      setBudgetsLoading(false);
    }
  }, []);

  // Check initial authentication state via /api/auth/me on app mount
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const verifySession = async () => {
      try {
        const user = await api.getMe(controller.signal);
        if (isMounted) {
          setCurrentUser(user);
          if (user.currency) {
            setCurrency(user.currency as SupportedCurrency);
          }
          setApiStatus('online');
          void loadTransactions();
          void loadAccounts();
          void loadBudgets();
          void loadCategories();
        }
      } catch {
        if (isMounted) {
          setCurrentUser(null);
          setTransactions([]);
          setBudgets([]);
          setAccounts([]);
          // Check if backend is reachable
          try {
            await api.checkHealth(controller.signal);
            setApiStatus('online');
          } catch {
            setApiStatus('offline');
          }
        }
      } finally {
        if (isMounted) {
          setIsCheckingAuth(false);
        }
      }
    };

    void verifySession();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [loadAccounts, loadCategories, loadTransactions, loadBudgets]);

  // Handle user navigation (updates state, browser history URL, and localStorage)
  const handleNavigate = (nav: string) => {
    if (!isValidNavPage(nav)) return;
    if (nav === activeNav) return;
    setActiveNav(nav as NavPage);
    const path = getPathForNav(nav as NavPage);
    window.history.pushState({ nav }, '', path);
    localStorage.setItem('fintrack_nav', nav);
  };

  // Listen to browser Back/Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setActiveNav(getNavFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync active page title to browser document
  useEffect(() => {
    const pageTitles: Record<NavPage, string> = {
      dashboard: 'Dashboard | FinTrack',
      accounts: 'Accounts | FinTrack',
      transactions: 'Transactions | FinTrack',
      categories: 'Categories | FinTrack',
      budgets: 'Budgets | FinTrack',
      analytics: 'Analytics | FinTrack',
      settings: 'Settings | FinTrack',
    };
    document.title = pageTitles[activeNav] || 'FinTrack';
  }, [activeNav]);

  // Sync currency preference to localStorage
  useEffect(() => {
    localStorage.setItem('fintrack_currency', currency);
  }, [currency]);

  // Compute live summary metrics strictly from the user's real transactions
  // Note: Transfers do not count as income or expense.
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

  // totalBalance: start with the true net worth across all accounts (sum of
  // opening balances + account-linked income − expenses ± transfers). Then add
  // the net of unassigned transactions (those with no accountId) so they are
  // not silently excluded. Transfers always have accountId, so the filter
  // below safely ignores them and avoids double-counting.
  if (accounts.length > 0) {
    const accountNetWorth = calculateTotalNetWorth(accounts, transactions);
    const unassignedNet = transactions
      .filter((tx) => !tx.accountId && tx.type !== 'transfer')
      .reduce((sum, tx) => sum + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
    summary.totalBalance = accountNetWorth + unassignedNet;
  } else {
    summary.totalBalance = summary.totalIncome - summary.totalExpenses;
  }

  summary.savingsRate =
    summary.totalIncome > 0
      ? Math.max(0, ((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100)
      : 0;

  // Add / Edit transaction handler via Backend API
  const handleSaveTransaction = async (
    txData: Omit<Transaction, 'id'>,
    editId?: string
  ) => {
    setTransactionsError(null);
    if (editId) {
      const updated = await api.updateTransaction(editId, {
        title: txData.title,
        amount: txData.amount,
        type: txData.type,
        category: txData.category,
        date: txData.date,
        note: txData.note,
        accountId: txData.accountId,
        toAccountId: txData.toAccountId,
      });
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === editId ? updated : tx))
      );
    } else {
      const created = await api.createTransaction({
        title: txData.title,
        amount: txData.amount,
        type: txData.type,
        category: txData.category,
        date: txData.date,
        note: txData.note,
        accountId: txData.accountId,
        toAccountId: txData.toAccountId,
      });
      setTransactions((prev) => [created, ...prev]);
    }
    // Refresh accounts to reflect dynamic balance updates from backend
    void loadAccounts();
  };

  // Delete transaction handler via Backend API
  const handleDeleteTransaction = async (id: string) => {
    setTransactionsError(null);
    try {
      await api.deleteTransaction(id);
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
      // Refresh accounts to reflect dynamic balance updates from backend
      void loadAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete transaction';
      setTransactionsError(message);
    }
  };

  // Add / update budget handler via Backend API
  const handleSaveBudget = async (
    category: TransactionCategory,
    monthlyLimit: number,
    editId?: string
  ) => {
    setBudgetsError(null);
    if (editId) {
      const updated = await api.updateBudget(editId, {
        category,
        monthlyLimit,
      });
      setBudgets((prev) =>
        prev.map((b) => (b.id === editId ? updated : b))
      );
    } else {
      const created = await api.createBudget({
        category,
        monthlyLimit,
      });
      setBudgets((prev) => [...prev, created]);
    }
  };

  // Remove budget handler via Backend API
  const handleRemoveBudget = async (id: string) => {
    setBudgetsError(null);
    try {
      await api.deleteBudget(id);
      setBudgets((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete budget';
      setBudgetsError(message);
    }
  };

  // Add / Edit category handler via Backend API
  const handleSaveCategory = async (
    data: CreateCategoryInput,
    editId?: string
  ) => {
    setCategoriesError(null);
    if (editId) {
      const updated = await api.updateCategory(editId, data);
      setCategories((prev) =>
        prev.map((c) => (c.id === editId ? updated : c))
      );
    } else {
      const created = await api.createCategory(data);
      setCategories((prev) => [...prev, created]);
    }
    void loadCategories();
  };

  // Delete category handler via Backend API
  const handleDeleteCategory = async (id: string) => {
    setCategoriesError(null);
    try {
      await api.deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      void loadCategories();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete category';
      setCategoriesError(message);
      throw err;
    }
  };

  // Open modal for adding a new transaction
  const handleOpenAddModal = () => {
    setEditingTransaction(null);
    setIsAddModalOpen(true);
  };

  // Open modal for editing an existing transaction
  const handleOpenEditModal = (tx: Transaction) => {
    setEditingTransaction(tx);
    setIsAddModalOpen(true);
  };

  // Close modal and reset editing state
  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setEditingTransaction(null);
  };

  // Add account handler via Backend API
  const handleAddAccount = async (data: Omit<Account, 'id' | 'createdAt'>) => {
    setAccountsError(null);
    try {
      await api.createAccount({
        name: data.name,
        type: data.type,
        openingBalance: data.openingBalance,
        currency: data.currency,
        note: data.note ?? undefined,
      });
      await loadAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      setAccountsError(message);
      throw err;
    }
  };

  // Edit account handler via Backend API
  const handleEditAccount = async (
    data: Omit<Account, 'id' | 'createdAt'>,
    editId: string
  ) => {
    setAccountsError(null);
    try {
      await api.updateAccount(editId, {
        name: data.name,
        type: data.type,
        openingBalance: data.openingBalance,
        currency: data.currency,
        note: data.note,
        isArchived: data.isArchived,
      });
      await loadAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update account';
      setAccountsError(message);
      throw err;
    }
  };

  // Delete account handler via Backend API
  const handleDeleteAccount = async (id: string) => {
    setAccountsError(null);
    try {
      await api.deleteAccount(id);
      await loadAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account';
      setAccountsError(message);
      throw err;
    }
  };

  // Clear local data for the current user session
  const handleResetData = () => {
    if (currentUser?.id) {
      localStorage.removeItem(`fintrack_transactions_${currentUser.id}`);
      localStorage.removeItem(`fintrack_budgets_${currentUser.id}`);
    }
    localStorage.removeItem('fintrack_transactions');
    localStorage.removeItem('fintrack_budgets');
    localStorage.removeItem('fintrack_accounts');
    void loadTransactions();
    void loadAccounts();
    void loadBudgets();
  };

  // User logout handler
  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Proceed with clearing local state regardless
    }
    // Clean up legacy keys
    localStorage.removeItem('fintrack_transactions');
    localStorage.removeItem('fintrack_budgets');
    localStorage.removeItem('fintrack_accounts');

    // Clear in-memory financial state
    setCurrentUser(null);
    setAccounts([]);
    setTransactions([]);
    setBudgets([]);
    setCategories([]);
    setActiveNav('dashboard');
  };

  // 1. Initial Loading Screen during session check
  if (isCheckingAuth) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-spinner" />
        <p>Verifying secure session...</p>
      </div>
    );
  }

  // 2. Unauthenticated View: Render Login / Register Screen
  if (!currentUser) {
    return (
      <AuthPage
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          if (user.currency) {
            setCurrency(user.currency as SupportedCurrency);
          }
          setApiStatus('online');
          void loadTransactions();
          void loadAccounts();
          void loadBudgets();
          void loadCategories();
        }}
      />
    );
  }

  // 3. Authenticated View: Render Main FinTrack App Layout
  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeNav={activeNav}
        setActiveNav={handleNavigate}
        currentUser={currentUser}
        onLogout={handleLogout}
        transactionCount={transactions.length}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top bar with hamburger for mobile */}
        <header className="topbar">
          <button
            className="menu-toggle-btn"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open sidebar menu"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <div className="topbar-title">
            <h1 className="page-heading">
              {activeNav === 'dashboard' && 'Dashboard'}
              {activeNav === 'accounts' && 'Accounts'}
              {activeNav === 'transactions' && 'Transactions'}
              {activeNav === 'categories' && 'Categories'}
              {activeNav === 'budgets' && 'Budgets'}
              {activeNav === 'analytics' && 'Analytics'}
              {activeNav === 'settings' && 'Settings'}
            </h1>
            <span className="page-subheading">
              {activeNav === 'dashboard' && 'Overview of your personal financial metrics and recent cash flows.'}
              {activeNav === 'accounts' && 'Manage your financial accounts and real-time balances.'}
              {activeNav === 'transactions' && 'View, search, and manage all recorded transactions.'}
              {activeNav === 'categories' && 'Manage expense and income categories for your transactions and budgets.'}
              {activeNav === 'budgets' && 'Monitor category spend limits and monthly allowances.'}
              {activeNav === 'analytics' && 'Inspect categorized expense patterns and savings velocity.'}
              {activeNav === 'settings' && 'Preferences, storage status, and application info.'}
            </span>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setTheme((currentTheme) => currentTheme === 'light' ? 'dark' : 'light')}
              aria-label={`Switch to ${theme === 'light' ? 'night' : 'day'} mode`}
              title={`Switch to ${theme === 'light' ? 'night' : 'day'} mode`}
            >
              {theme === 'light' ? (
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
                </svg>
              ) : (
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                </svg>
              )}
              <span>{theme === 'light' ? 'Night mode' : 'Day mode'}</span>
            </button>
            {/* Backend connectivity indicator pill */}
            <div
              className={`api-status-pill ${
                apiStatus === 'online'
                  ? 'status-online'
                  : apiStatus === 'offline'
                  ? 'status-offline'
                  : 'status-checking'
              }`}
              title={
                apiStatus === 'online'
                  ? 'Connected to FinTrack backend API'
                  : apiStatus === 'offline'
                  ? 'FinTrack backend offline - using local storage'
                  : 'Checking backend connection...'
              }
            >
              <span className="status-dot"></span>
              <span className="status-text">
                {apiStatus === 'online' ? 'API Online' : apiStatus === 'offline' ? 'Offline' : 'Connecting'}
              </span>
            </div>

            <button
              className="btn-primary topbar-add-btn"
              onClick={handleOpenAddModal}
              id="topbar-add-tx-btn"
              aria-label="Add transaction"
            >
              <svg
              aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add Transaction</span>
            </button>

          </div>
        </header>

        {/* Dynamic Page Views */}
        <div className="content-container">
          {activeNav === 'dashboard' && (
            <>
              {/* Financial Metric Cards */}
              <SummaryCards summary={summary} currency={currency} />

              {/* Recent Transactions List with Filters & Search */}
              <TransactionList
                transactions={transactions}
                accounts={accounts}
                categories={categories}
                maxItems={10}
                onViewAll={() => handleNavigate('transactions')}
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
              isLoading={accountsLoading}
              error={accountsError}
              onClearError={() => setAccountsError(null)}
              onRetry={loadAccounts}
            />
          )}

          {activeNav === 'transactions' && (
            <TransactionsPage
              transactions={transactions}
              accounts={accounts}
              categories={categories}
              onDeleteTransaction={handleDeleteTransaction}
              onEditTransaction={handleOpenEditModal}
              currency={currency}
              isLoading={transactionsLoading}
              error={transactionsError}
              onClearError={() => setTransactionsError(null)}
              onRetry={loadTransactions}
            />
          )}

          {activeNav === 'categories' && (
            <CategoriesPage
              categories={categories}
              onSaveCategory={handleSaveCategory}
              onDeleteCategory={handleDeleteCategory}
              isLoading={categoriesLoading}
              error={categoriesError}
              onClearError={() => setCategoriesError(null)}
              onRetry={loadCategories}
            />
          )}

          {activeNav === 'budgets' && (
            <BudgetsPage
              budgets={budgets}
              transactions={transactions}
              categories={categories}
              onSaveBudget={handleSaveBudget}
              onRemoveBudget={handleRemoveBudget}
              currency={currency}
              isLoading={budgetsLoading}
              error={budgetsError}
              onClearError={() => setBudgetsError(null)}
              onRetry={loadBudgets}
            />
          )}

          {activeNav === 'analytics' && (
            <AnalyticsPage transactions={transactions} categories={categories} currency={currency} />
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

          {/* Footer */}
          <footer className="dashboard-footer">
            <span className="footer-note">
              FinTrack v1.0 • Running client on Vite + React + TypeScript
            </span>
            <button className="reset-data-btn" onClick={handleResetData}>
              Clear Local Data
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
        categories={categories}
      />
    </div>
  );
}

export default App;

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
import { api, ApiError } from './services/api';
import { AuthPage } from './components/AuthPage';
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
import { calculateTotalNetWorth } from './utils/accountUtils';
import { EXPENSE_CATEGORIES } from './utils/transactionFilters';

function loadUserTransactions(userId: string): Transaction[] {
  try {
    localStorage.removeItem('fintrack_transactions');
    const saved = localStorage.getItem(`fintrack_transactions_${userId}`);
    return saved ? (JSON.parse(saved) as Transaction[]) : [];
  } catch {
    return [];
  }
}

function loadUserBudgets(userId: string): CategoryBudget[] {
  try {
    localStorage.removeItem('fintrack_budgets');
    const saved = localStorage.getItem(`fintrack_budgets_${userId}`);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    const seenCategories = new Set<string>();
    const validBudgets: CategoryBudget[] = [];
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (
          item &&
          typeof item.id === 'string' &&
          typeof item.category === 'string' &&
          typeof item.monthlyLimit === 'number' &&
          EXPENSE_CATEGORIES.includes(item.category as TransactionCategory) &&
          !seenCategories.has(item.category)
        ) {
          seenCategories.add(item.category);
          validBudgets.push({
            id: item.id,
            category: item.category as TransactionCategory,
            monthlyLimit: Math.max(0, Math.round((item.monthlyLimit + Number.EPSILON) * 100) / 100),
          });
        }
      }
    }
    return validBudgets;
  } catch {
    return [];
  }
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Financial state starts strictly empty for authenticated users
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);

  // Accounts state is strictly sourced from backend API (no stale localStorage fallback)
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [, setCategories] = useState<Category[]>([]);
  const [, setCategoriesLoading] = useState(false);
  const [, setCategoriesError] = useState<string | null>(null);

  const [currency, setCurrency] = useState<SupportedCurrency>(() => {
    const saved = localStorage.getItem('fintrack_currency');
    return (saved as SupportedCurrency) || 'USD';
  });

  const [activeNav, setActiveNav] = useState<NavPage>(() => getNavFromLocation());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

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

  // Check initial authentication state via /api/auth/me on app mount
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const verifySession = async () => {
      try {
        const user = await api.getMe(controller.signal);
        if (isMounted) {
          setCurrentUser(user);
          setTransactions(loadUserTransactions(user.id));
          setBudgets(loadUserBudgets(user.id));
          if (user.currency) {
            setCurrency(user.currency as SupportedCurrency);
          }
          setApiStatus('online');
          void loadAccounts();
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
  }, [loadAccounts, loadCategories]);

  // Sync transactions to user-scoped localStorage
  useEffect(() => {
    if (currentUser?.id) {
      localStorage.setItem(`fintrack_transactions_${currentUser.id}`, JSON.stringify(transactions));
    }
  }, [transactions, currentUser?.id]);

  // Sync budgets to user-scoped localStorage
  useEffect(() => {
    if (currentUser?.id) {
      localStorage.setItem(`fintrack_budgets_${currentUser.id}`, JSON.stringify(budgets));
    }
  }, [budgets, currentUser?.id]);

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

  // totalBalance: when accounts exist, use the true net worth (sum of all
  // account balances = opening balances + income − expenses ± transfers).
  // When no accounts exist, compute from real transactions (income − expenses),
  // resulting in 0 if no transactions exist.
  summary.totalBalance =
    accounts.length > 0
      ? calculateTotalNetWorth(accounts, transactions)
      : summary.totalIncome - summary.totalExpenses;

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
        prev.map((tx) =>
          tx.id === editId
            ? { ...txData, id: editId }
            : tx
        )
      );
    } else {
      const newTx: Transaction = {
        ...txData,
        id: `tx-${Date.now()}`,
      };
      setTransactions((prev) => [newTx, ...prev]);
    }
    // Refresh accounts to reflect live balance updates from backend
    void loadAccounts();
  };

  // Delete transaction handler
  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    // Refresh accounts to reflect live balance updates from backend
    void loadAccounts();
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
    setTransactions([]);
    setBudgets([]);
    if (currentUser?.id) {
      localStorage.removeItem(`fintrack_transactions_${currentUser.id}`);
      localStorage.removeItem(`fintrack_budgets_${currentUser.id}`);
    }
    localStorage.removeItem('fintrack_transactions');
    localStorage.removeItem('fintrack_budgets');
    localStorage.removeItem('fintrack_accounts');
    void loadAccounts();
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
          setTransactions(loadUserTransactions(user.id));
          setBudgets(loadUserBudgets(user.id));
          if (user.currency) {
            setCurrency(user.currency as SupportedCurrency);
          }
          setApiStatus('online');
          void loadAccounts();
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
              {activeNav === 'budgets' && 'Budgets'}
              {activeNav === 'analytics' && 'Analytics'}
              {activeNav === 'settings' && 'Settings'}
            </h1>
            <span className="page-subheading">
              {activeNav === 'dashboard' && 'Overview of your personal financial metrics and recent cash flows.'}
              {activeNav === 'accounts' && 'Manage your financial accounts and real-time balances.'}
              {activeNav === 'transactions' && 'View, search, and manage all recorded transactions.'}
              {activeNav === 'budgets' && 'Monitor category spend limits and monthly allowances.'}
              {activeNav === 'analytics' && 'Inspect categorized expense patterns and savings velocity.'}
              {activeNav === 'settings' && 'Preferences, storage status, and application info.'}
            </span>
          </div>

          <div className="topbar-actions">
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

            <button
              className="topbar-logout-btn"
              onClick={handleLogout}
              id="topbar-logout-btn"
              title="Log Out"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>Logout</span>
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
              onDeleteTransaction={handleDeleteTransaction}
              onEditTransaction={handleOpenEditModal}
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
      />
    </div>
  );
}

export default App;

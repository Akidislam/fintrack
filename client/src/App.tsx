import { useState, useEffect } from 'react';
import './App.css';
import type { Transaction, FinancialSummary } from './types';
import { INITIAL_TRANSACTIONS } from './data/mockData';
import { Sidebar } from './components/Sidebar';
import { SummaryCards } from './components/SummaryCards';
import { TransactionList } from './components/TransactionList';
import { AddTransactionModal } from './components/AddTransactionModal';

export function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('fintrack_transactions');
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });

  const [activeNav, setActiveNav] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Sync transactions to localStorage for persistent session testing
  useEffect(() => {
    localStorage.setItem('fintrack_transactions', JSON.stringify(transactions));
  }, [transactions]);

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

  // Quick reset to initial mock data
  const handleResetData = () => {
    setTransactions(INITIAL_TRANSACTIONS);
    localStorage.removeItem('fintrack_transactions');
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
              <h1 className="greeting-title">FinTrack Dashboard</h1>
              <p className="greeting-subtitle">Track your wealth, monthly cash flow, and spending habits.</p>
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
          {/* Financial Summary Cards */}
          <SummaryCards summary={summary} />

          {/* Recent Transactions List with Filters & Search */}
          <TransactionList
            transactions={transactions}
            onDeleteTransaction={handleDeleteTransaction}
            onOpenAddModal={() => setIsAddModalOpen(true)}
          />

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
      />
    </div>
  );
}

export default App;

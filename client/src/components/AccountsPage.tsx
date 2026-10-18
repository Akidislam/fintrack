import React from 'react';

export const AccountsPage: React.FC = () => {
  return (
    <div className="transactions-section">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Accounts</h2>
          <span className="section-subtitle">
            Manage your financial accounts and institution connections
          </span>
        </div>
      </div>

      <div className="empty-state">
        <div className="empty-icon">🏦</div>
        <h3 className="empty-title">Account Management Coming Soon</h3>
        <p className="empty-desc">
          Account management will be implemented in an upcoming milestone with PostgreSQL database integration. You will be able to add and track checking accounts, credit cards, savings, and investments here.
        </p>
      </div>
    </div>
  );
};

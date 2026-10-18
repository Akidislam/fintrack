import React from 'react';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, description }) => {
  return (
    <div className="transactions-section">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">{title}</h2>
          <span className="section-subtitle">{description}</span>
        </div>
      </div>

      <div className="empty-state">
        <div className="empty-icon">🚧</div>
        <h3 className="empty-title">{title} Page Under Construction</h3>
        <p className="empty-desc">
          This section is currently under development and will be available in an upcoming update.
        </p>
      </div>
    </div>
  );
};

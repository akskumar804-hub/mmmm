import React from 'react'

export default function DashboardCard({ title, value, helper, accent }) {
  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <span className="dashboard-card-title">{title}</span>
        {accent && <span className="dashboard-card-accent">{accent}</span>}
      </div>
      <div className="dashboard-card-value">{value}</div>
      {helper && <div className="dashboard-card-helper">{helper}</div>}
    </div>
  )
}

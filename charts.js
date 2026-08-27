/**
 * FinFlow AppCharts - Chart.js Engine for Cash Flow Trend & Category Breakdown
 */
(function(window) {
  'use strict';

  let cashFlowChart = null;
  let categoryChart = null;

  const AppCharts = {
    init() {
      if (typeof Chart === 'undefined') return;
      try {
        Chart.defaults.font.family = 'Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, sans-serif';
        Chart.defaults.color = '#94a3b8';
      } catch(e) {}
    },

    /**
     * Renders 6-Month Cash Flow Trend Line Chart on #cashFlowChartCanvas
     */
    renderCashFlowTrend(transactions) {
      if (typeof Chart === 'undefined') return;
      const canvas = document.getElementById('cashFlowChartCanvas');
      if (!canvas) return;

      const txs = Array.isArray(transactions) ? transactions : [];

      // Generate last 6 months
      const months = [];
      const incomeData = [0, 0, 0, 0, 0, 0];
      const expenseData = [0, 0, 0, 0, 0, 0];

      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabel = d.toLocaleString('default', { month: 'short' });
        months.push({ label: monthLabel, year: d.getFullYear(), month: d.getMonth() });
      }

      // Aggregate transaction amounts per month
      txs.forEach(tx => {
        if (!tx.date) return;
        const txDate = new Date(tx.date);
        const txYear = txDate.getFullYear();
        const txMonth = txDate.getMonth();
        const amount = Number(tx.amount) || 0;

        months.forEach((m, index) => {
          if (m.year === txYear && m.month === txMonth) {
            if (tx.type === 'income') {
              incomeData[index] += amount;
            } else if (tx.type === 'expense') {
              expenseData[index] += amount;
            }
          }
        });
      });

      if (cashFlowChart && typeof cashFlowChart.destroy === 'function') {
        try { cashFlowChart.destroy(); } catch(e) {}
      }

      try {
        const ctx = canvas.getContext('2d');
        cashFlowChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: months.map(m => m.label),
            datasets: [
              {
                label: 'Income',
                data: incomeData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                tension: 0.35,
                fill: true,
                borderWidth: 2.5,
                pointRadius: 4,
                pointBackgroundColor: '#10b981'
              },
              {
                label: 'Expenses',
                data: expenseData,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                tension: 0.35,
                fill: true,
                borderWidth: 2.5,
                pointRadius: 4,
                pointBackgroundColor: '#ef4444'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                position: 'top',
                labels: { color: '#94a3b8', font: { weight: '600' }, usePointStyle: true, boxWidth: 8 }
              },
              tooltip: {
                backgroundColor: '#1e293b',
                titleColor: '#f8fafc',
                bodyColor: '#cbd5e1',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 10
              }
            },
            scales: {
              x: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#94a3b8' }
              },
              y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#94a3b8' },
                beginAtZero: true
              }
            }
          }
        });
      } catch (err) {
        console.warn('Cash flow chart render error:', err);
      }
    },

    /**
     * Renders Expenses Category Breakdown Doughnut Chart on #categoryChartCanvas
     */
    updateCategoryChart(categoryData) {
      if (typeof Chart === 'undefined') return;
      const canvas = document.getElementById('categoryChartCanvas');
      if (!canvas) return;

      const dataObj = (categoryData && typeof categoryData === 'object') ? categoryData : {};
      const labels = Object.keys(dataObj);
      const values = Object.values(dataObj).map(v => Number(v) || 0);

      if (categoryChart && typeof categoryChart.destroy === 'function') {
        try { categoryChart.destroy(); } catch(e) {}
      }

      const chartLabels = labels.length > 0 ? labels : ['No Expenses Recorded'];
      const chartValues = labels.length > 0 ? values : [1];
      const colors = labels.length > 0 
        ? ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#14b8a6', '#f43f5e']
        : ['rgba(255, 255, 255, 0.08)'];

      try {
        const ctx = canvas.getContext('2d');
        categoryChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: chartLabels,
            datasets: [{
              data: chartValues,
              backgroundColor: colors.slice(0, chartLabels.length),
              borderWidth: 0,
              hoverOffset: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: '#94a3b8', boxWidth: 10, padding: 12, font: { size: 11, weight: '600' } }
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    if (labels.length === 0) return ' No expense data yet';
                    const val = context.raw || 0;
                    return  : ;
                  }
                }
              }
            },
            cutout: '68%'
          }
        });
      } catch (err) {
        console.warn('Category chart render error:', err);
      }
    },

    updateAll(transactions, categoryData) {
      if (transactions) this.renderCashFlowTrend(transactions);
      if (categoryData) this.updateCategoryChart(categoryData);
    },

    updateCharts(transactions, categoryData) {
      this.updateAll(transactions, categoryData);
    },

    updateTheme() {
      this.updateAll();
    }
  };

  window.AppCharts = AppCharts;
})(window);

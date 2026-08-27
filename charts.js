/**
 * FinFlow AppCharts - Chart.js Wrapper Module
 */
(function() {
  'use strict';

  let incomeVsExpenseChart = null;
  let categoryBreakdownChart = null;

  const AppCharts = {
    init() {
      if (typeof Chart === 'undefined') return;
      try {
        Chart.defaults.font.family = 'Plus Jakarta Sans, sans-serif';
        Chart.defaults.color = '#94a3b8';
      } catch(e) {}
    },

    updateAll() {
      if (incomeVsExpenseChart && typeof incomeVsExpenseChart.update === 'function') {
        try { incomeVsExpenseChart.update(); } catch(e) {}
      }
      if (categoryBreakdownChart && typeof categoryBreakdownChart.update === 'function') {
        try { categoryBreakdownChart.update(); } catch(e) {}
      }
    },

    updateCategoryChart(categoryData) {
      if (!categoryData || typeof Chart === 'undefined') return;
      const canvas = document.getElementById('categoryChart');
      if (!canvas) return;

      const labels = Object.keys(categoryData);
      const data = Object.values(categoryData);
      if (labels.length === 0) return;

      if (categoryBreakdownChart && typeof categoryBreakdownChart.destroy === 'function') {
        try { categoryBreakdownChart.destroy(); } catch(e) {}
      }

      const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#14b8a6'];

      try {
        const ctx = canvas.getContext('2d');
        categoryBreakdownChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: colors.slice(0, labels.length),
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: '#94a3b8', boxWidth: 12, padding: 12 }
              }
            },
            cutout: '70%'
          }
        });
      } catch (err) {
        console.warn('Category chart render warning:', err);
      }
    },

    updateCharts() {
      this.updateAll();
    },

    updateTheme() {
      this.updateAll();
    }
  };

  window.AppCharts = AppCharts;
})();

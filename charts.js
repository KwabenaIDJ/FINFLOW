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

      // Retrieve the user's selected active currency symbol from AppStore settings
      const activeCurrency = (window.AppStore && typeof window.AppStore.getSettings === 'function')
        ? (window.AppStore.getSettings().currency || 'GH₵')
        : 'GH₵';

      // Aggregate transaction amounts per month safely with currency conversion
      txs.forEach(tx => {
        // Check if transaction has a valid date
        if (!tx.date) return;
        // Declare year and month variables
        let txYear = 0, txMonth = 0;
        // Parse date string in YYYY-MM-DD format
        if (typeof tx.date === 'string' && tx.date.includes('-')) {
          // Split date by dash separator
          const parts = tx.date.split('T')[0].split('-');
          // Parse year integer
          txYear = parseInt(parts[0], 10);
          // Parse month (0-indexed)
          txMonth = parseInt(parts[1], 10) - 1;
        // Fallback to standard Date constructor
        } else {
          // Instantiate Date object
          const d = new Date(tx.date);
          // Extract year
          txYear = d.getFullYear();
          // Extract month
          txMonth = d.getMonth();
        // End date parsing condition
        }
        // Retrieve base transaction amount stored in GH₵
        const rawAmount = Number(tx.amount) || 0;
        // Convert amount from base GH₵ into the user's active selected currency
        const amount = (typeof window.convertCurrencyAmount === 'function')
          ? window.convertCurrencyAmount(rawAmount, activeCurrency, 'GH₵')
          : rawAmount;

        // Iterate across the last 6 months to accumulate values
        months.forEach((m, index) => {
          // Check if transaction date matches this month bucket
          if (m.year === txYear && m.month === txMonth) {
            // Check if transaction is income
            if (tx.type === 'income') {
              // Add converted amount to income dataset
              incomeData[index] += amount;
            // Check if transaction is expense
            } else if (tx.type === 'expense') {
              // Add converted amount to expense dataset
              expenseData[index] += amount;
            // End transaction type condition
            }
          // End month match condition
          }
        // End months iteration
        });
      // End txs iteration
      });

      // Round all monthly aggregated amounts to two decimal places
      for (let i = 0; i < 6; i++) {
        // Round income monthly total
        incomeData[i] = Math.round(incomeData[i] * 100) / 100;
        // Round expenses monthly total
        expenseData[i] = Math.round(expenseData[i] * 100) / 100;
      // End monthly rounding loop
      }

      // Destroy previous chart instance before re-creating
      if (cashFlowChart && typeof cashFlowChart.destroy === 'function') {
        // Safely destroy previous chart
        try { cashFlowChart.destroy(); } catch(e) {}
      // End destroy check
      }

      // Try block to render updated Chart.js instance
      try {
        // Obtain 2D canvas rendering context
        const ctx = canvas.getContext('2d');
        // Instantiate new Chart object
        cashFlowChart = new Chart(ctx, {
          // Line chart configuration
          type: 'line',
          // Dataset definitions
          data: {
            // Month labels on X axis
            labels: months.map(m => m.label),
            // Dataset series
            datasets: [
              // Income dataset
              {
                // Income series label
                label: 'Income',
                // Converted income figures
                data: incomeData,
                // Green line color
                borderColor: '#10b981',
                // Semi-transparent green fill
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                // Smooth curve tension
                tension: 0.35,
                // Enable gradient fill below line
                fill: true,
                // Border line thickness
                borderWidth: 2.5,
                // Data point circle radius
                pointRadius: 4,
                // Point color
                pointBackgroundColor: '#10b981'
              // End Income dataset
              },
              // Expense dataset
              {
                // Expense series label
                label: 'Expenses',
                // Converted expense figures
                data: expenseData,
                // Red line color
                borderColor: '#ef4444',
                // Semi-transparent red fill
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                // Smooth curve tension
                tension: 0.35,
                // Enable gradient fill below line
                fill: true,
                // Border line thickness
                borderWidth: 2.5,
                // Data point circle radius
                pointRadius: 4,
                // Point color
                pointBackgroundColor: '#ef4444'
              // End Expense dataset
              }
            // End datasets array
            ]
          // End data configuration
          },
          // Chart rendering options
          options: {
            // Allow responsive fluid resizing
            responsive: true,
            // Allow container height flexibility
            maintainAspectRatio: false,
            // Index-based hover interaction
            interaction: { mode: 'index', intersect: false },
            // Plugins configuration
            plugins: {
              // Chart legend settings
              legend: {
                // Place legend at the top
                position: 'top',
                // Legend label formatting
                labels: { color: '#94a3b8', font: { weight: '600' }, usePointStyle: true, boxWidth: 8 }
              // End legend configuration
              },
              // Tooltip configuration
              tooltip: {
                // Dark background color
                backgroundColor: '#1e293b',
                // White title color
                titleColor: '#f8fafc',
                // Light gray body color
                bodyColor: '#cbd5e1',
                // Subtle border
                borderColor: 'rgba(255,255,255,0.1)',
                // Border width
                borderWidth: 1,
                // Tooltip padding
                padding: 10,
                // Tooltip callback handlers
                callbacks: {
                  // Custom tooltip label callback to format values with active currency symbol
                  label: function(context) {
                    // Extract numeric value of current dataset point
                    const val = Number(context.raw) || 0;
                    // Format number with commas and two decimals
                    const formatted = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    // Return dataset label with active currency and converted value
                    return ` ${context.dataset.label}: ${activeCurrency}${formatted}`;
                  // End tooltip callback
                  }
                // End callbacks object
                }
              // End tooltip configuration
              }
            // End plugins configuration
            },
            // Chart axes configuration
            scales: {
              // Horizontal X axis
              x: {
                // Subtle grid line color
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                // Tick text color
                ticks: { color: '#94a3b8' }
              // End X axis
              },
              // Vertical Y axis
              y: {
                // Subtle grid line color
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                // Y-axis tick configuration
                ticks: {
                  // Tick text color
                  color: '#94a3b8',
                  // Format Y-axis tick numbers with currency symbol
                  callback: function(value) {
                    // Prepend active currency symbol to Y-axis tick mark
                    return activeCurrency + Number(value).toLocaleString('en-US');
                  // End tick callback
                  }
                // End ticks object
                },
                // Force scale to begin at zero
                beginAtZero: true
              // End Y axis
              }
            // End scales configuration
            }
          // End options configuration
          }
        // End Chart instantiation
        });
      // Catch and log any chart rendering errors
      } catch (err) {
        // Log error to console
        console.warn('Cash flow chart render error:', err);
      // End try-catch
      }
    },

    /**
     * Renders Expenses Category Breakdown Doughnut Chart on #categoryChartCanvas
     */
    updateCategoryChart(categoryData) {
      // Check if Chart library is loaded
      if (typeof Chart === 'undefined') return;
      // Obtain category chart canvas element
      const canvas = document.getElementById('categoryChartCanvas');
      // Verify canvas element exists
      if (!canvas) return;

      // Retrieve user's active currency symbol from AppStore
      const activeCurrency = (window.AppStore && typeof window.AppStore.getSettings === 'function')
        ? (window.AppStore.getSettings().currency || 'GH₵')
        : 'GH₵';

      // Ensure data object is valid
      const dataObj = (categoryData && typeof categoryData === 'object') ? categoryData : {};
      // Extract category names
      const labels = Object.keys(dataObj);
      // Extract converted category expense sums rounded to 2 decimal places
      const values = Object.values(dataObj).map(v => Math.round((Number(v) || 0) * 100) / 100);

      // Destroy previous chart instance before re-creating
      if (categoryChart && typeof categoryChart.destroy === 'function') {
        // Safely destroy previous chart
        try { categoryChart.destroy(); } catch(e) {}
      // End destroy check
      }

      // Prepare labels fallback
      const chartLabels = labels.length > 0 ? labels : ['No Expenses Recorded'];
      // Prepare values fallback
      const chartValues = labels.length > 0 ? values : [1];
      // Define chart color palette
      const colors = labels.length > 0 
        ? ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#14b8a6', '#f43f5e']
        : ['rgba(255, 255, 255, 0.08)'];

      // Try block to render Doughnut Chart
      try {
        // Retrieve 2D canvas context
        const ctx = canvas.getContext('2d');
        // Instantiate new Chart object
        categoryChart = new Chart(ctx, {
          // Doughnut chart type
          type: 'doughnut',
          // Data object
          data: {
            // Category labels
            labels: chartLabels,
            // Datasets array
            datasets: [{
              // Data slice values
              data: chartValues,
              // Slice background colors
              backgroundColor: colors.slice(0, chartLabels.length),
              // No borders
              borderWidth: 0,
              // Hover offset spacing
              hoverOffset: 6
            // End dataset object
            }]
          // End data configuration
          },
          // Chart options
          options: {
            // Enable responsive resizing
            responsive: true,
            // Allow container height flexibility
            maintainAspectRatio: false,
            // Plugins configuration
            plugins: {
              // Legend configuration
              legend: {
                // Position legend at bottom
                position: 'bottom',
                // Legend label styles
                labels: { color: '#94a3b8', boxWidth: 10, padding: 12, font: { size: 11, weight: '600' } }
              // End legend
              },
              // Tooltip configuration
              tooltip: {
                // Tooltip callbacks object
                callbacks: {
                  // Custom category breakdown label formatter
                  label: function(context) {
                    // Fallback when no expenses exist
                    if (labels.length === 0) return ' No expense data yet';
                    // Extract raw numeric slice value
                    const val = Number(context.raw) || 0;
                    // Format with commas and two decimals
                    const formatted = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    // Return formatted category label with currency symbol
                    return ` ${context.label}: ${activeCurrency}${formatted}`;
                  // End label callback
                  }
                // End callbacks object
                }
              // End tooltip
              }
            // End plugins
            },
            // Cutout percentage for clean doughnut hole
            cutout: '68%'
          // End options
          }
        // End Chart instantiation
        });
      // Catch and log rendering errors
      } catch (err) {
        // Log warning
        console.warn('Category chart render error:', err);
      // End try-catch
      }
    // End updateCategoryChart
    },

    // Re-renders both charts with full store data synchronization
    updateAll(transactions, categoryData) {
      // Check if global syncUI function is available
      if (typeof window.syncUI === 'function') {
        // Trigger complete application UI refresh
        window.syncUI();
      // Otherwise render charts directly
      } else {
        // Access application store
        const store = window.AppStore;
        // Retrieve transaction history
        const txs = transactions || (store && typeof store.getTransactions === 'function' ? store.getTransactions() : []);
        // Render cash flow trend line chart
        this.renderCashFlowTrend(txs);
        // Render category breakdown if provided
        if (categoryData) this.updateCategoryChart(categoryData);
      // End syncUI check
      }
    // End updateAll
    },

    // Alias for updateAll
    updateCharts(transactions, categoryData) {
      // Forward call to updateAll
      this.updateAll(transactions, categoryData);
    // End updateCharts
    },

    // Refresh charts on theme switch
    updateTheme() {
      // Forward call to updateAll
      this.updateAll();
    // End updateTheme
    }
  };

  window.AppCharts = AppCharts;
})(window);

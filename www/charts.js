/**
 * Financial Dashboard Charts
 * Integrates with Chart.js to render and dynamically update dashboard visualizations.
 * Automatically adapts colors to dark/light theme shifts.
 */

(function (window) {
  // Enforce strict JavaScript mode to prevent silent coding bugs
  'use strict';

  // Local private reference anchors to Chart instances in memory
  let cashFlowChart = null;   // Cash flow comparison bar chart
  let categoryChart = null;   // Doughnut chart showing expenses categorized
  let portfolioChart = null;  // Doughnut chart showing portfolio allocation (not used currently, kept safe)

  // Theme-specific color configuration objects for canvas grids and text ticks
  const themeColors = {
    dark: {
      text: '#9ca3af',                    // Muted gray labels
      grid: 'rgba(255, 255, 255, 0.05)',   // Ultra-light white grid lines
      tooltipBg: '#1f2937',                // Slate gray tooltip container background
      tooltipText: '#f3f4f6',              // Light gray text inside tooltips
      tooltipBorder: 'rgba(255, 255, 255, 0.1)' // Soft white border contour
    },
    light: {
      text: '#64748b',                    // Cool slate gray ticks
      grid: 'rgba(15, 23, 42, 0.05)',      // Dark slate translucent grid lines
      tooltipBg: '#ffffff',                // White tooltip background
      tooltipText: '#0f172a',              // Midnight navy text inside tooltips
      tooltipBorder: 'rgba(15, 23, 42, 0.08)' // Soft navy boundary lines
    }
  };

  /**
   * Helper: Extracts active theme from DOM document attributes and returns corresponding color definitions.
   */
  function getThemeColors() {
    // Read the current data-theme attribute value, default to 'dark'
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    // Return appropriate theme details
    return themeColors[activeTheme];
  }

  // The main charts manager interface exposed globally
  const AppCharts = {
    
    /**
     * Initializes global default configurations for Chart.js and kicks off rendering.
     */
    init() {
      // Safety check: ensure Chart.js library is loaded
      if (typeof Chart === 'undefined') {
        console.error('Chart.js library is not loaded. Charts will not render.');
        return;
      }

      // Fetch the theme color parameters based on active configuration
      const colors = getThemeColors();
      
      // Override default font properties in Chart.js
      Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
      Chart.defaults.font.size = 12;
      // Bind tick text labels to current theme colors
      Chart.defaults.color = colors.text;
      
      // Override default legend style configurations
      Chart.defaults.plugins.legend.labels.boxWidth = 12;
      Chart.defaults.plugins.legend.labels.usePointStyle = true; // Use rounded indicators
      
      // Customize tooltips appearance options
      Chart.defaults.plugins.tooltip.padding = 10;
      Chart.defaults.plugins.tooltip.cornerRadius = 8;
      Chart.defaults.plugins.tooltip.backgroundColor = colors.tooltipBg;
      Chart.defaults.plugins.tooltip.titleColor = colors.tooltipText;
      Chart.defaults.plugins.tooltip.bodyColor = colors.tooltipText;
      Chart.defaults.plugins.tooltip.borderColor = colors.tooltipBorder;
      Chart.defaults.plugins.tooltip.borderWidth = 1;

      // Kick off chart rendering on load
      this.renderCashFlowChart();
      this.renderCategoryExpenseChart();
    },

    /**
     * Renders the comparative monthly Income vs Expense bar chart canvas.
     */
    renderCashFlowChart() {
      // Find the canvas container in the layout tree
      const ctx = document.getElementById('cashFlowChartCanvas');
      if (!ctx) return; // Exit if DOM node is missing

      const colors = getThemeColors();
      // Fetch historical flows for last 6 months from AppStore database
      const historicalData = window.AppStore.getHistoricalMonthlyFlow(6);
      
      // Extract specific arrays for axis labels, income records, and expense entries
      const labels = historicalData.map(h => h.label);
      const incomeData = historicalData.map(h => h.income);
      const expenseData = historicalData.map(h => h.expenses);

      // Instantiate a new Chart.js bar chart object
      cashFlowChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels, // Set horizontal ticks labels
          datasets: [
            {
              label: 'Income',
              data: incomeData,
              backgroundColor: '#10b981', // Emerald green
              borderRadius: 6,           // Smoothly rounded top corners
              borderSkipped: false,
              barPercentage: 0.6,
              categoryPercentage: 0.7
            },
            {
              label: 'Expenses',
              data: expenseData,
              backgroundColor: '#ef4444', // Crimson red
              borderRadius: 6,           // Smoothly rounded top corners
              borderSkipped: false,
              barPercentage: 0.6,
              categoryPercentage: 0.7
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false, // Fills container height
          plugins: {
            legend: {
              position: 'top', // Place legend above bars
              align: 'end'     // Align legend to right border
            }
          },
          scales: {
            x: {
              grid: {
                display: false // Hide vertical lines
              },
              ticks: {
                color: colors.text // Bind labels to current theme colors
              }
            },
            y: {
              grid: {
                color: colors.grid // Subtle horizontal grid boundaries
              },
              ticks: {
                color: colors.text,
                // Prefix ticks values with local store's preferred currency symbol
                callback: function (value) {
                  return window.AppStore.getSettings().currency + value;
                }
              }
            }
          }
        }
      });
    },

    /**
     * Renders the category expenditure breakdown doughnut chart.
     */
    renderCategoryExpenseChart() {
      const ctx = document.getElementById('categoryChartCanvas');
      if (!ctx) return; // Exit if DOM canvas is missing

      const today = new Date();
      // Fetch current month's category records
      const totals = window.AppStore.getMonthlyTotals(today.getFullYear(), today.getMonth());
      const breakdown = totals.categoryBreakdown;
      const categories = Object.keys(breakdown);
      const data = Object.values(breakdown);

      // Dedicated visual palette matching dashboard categories
      const categoryPalette = {
        'Rent': '#6366f1',          // Indigo
        'Food': '#10b981',          // Emerald green
        'Utilities': '#0ea5e9',     // Sky blue
        'Shopping': '#f59e0b',      // Amber yellow
        'Entertainment': '#ec4899', // Hot pink
        'Travel': '#a855f7',        // Grape purple
        'Other': '#6b7280'          // Cool gray
      };

      // Map color palette indices to categories
      const backgroundColors = categories.map(cat => categoryPalette[cat] || '#8b5cf6');

      // Instantiate a new Chart.js doughnut chart object
      categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: categories,
          datasets: [
            {
              data: data,
              backgroundColor: backgroundColors,
              borderWidth: 0, // Borderless sectors
              hoverOffset: 4  // Subtle shift outwards on hover
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%', // Inner cutout size to create a sleek modern ring layout
          plugins: {
            legend: {
              position: 'bottom', // Stack legend below doughnut
              labels: {
                padding: 15
              }
            }
          }
        }
      });
    },

    /**
     * Placeholder: Renders portfolio asset distributions (retained for layout stability).
     */
    renderPortfolioChart() {
      const ctx = document.getElementById('portfolioChartCanvas');
      if (!ctx) return;

      const portfolio = window.AppStore.getPortfolio();
      const labels = portfolio.map(a => a.symbol);
      const data = portfolio.map(a => a.shares * a.currentPrice);

      const colorPalette = [
        '#6366f1', // Indigo
        '#0ea5e9', // Sky
        '#10b981', // Emerald
        '#f59e0b', // Amber
        '#ec4899', // Pink
        '#8b5cf6'  // Purple
      ];

      portfolioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              backgroundColor: colorPalette.slice(0, portfolio.length),
              borderWidth: 0,
              hoverOffset: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 15
              }
            }
          }
        }
      });
    },

    /**
     * Synchronously redraws and updates data structures for all active chart instances.
     */
    updateAll() {
      // Exit if Chart library is not loaded
      if (typeof Chart === 'undefined') return;

      // 1. Redraw comparative bar chart data sets
      if (cashFlowChart) {
        const historicalData = window.AppStore.getHistoricalMonthlyFlow(6);
        cashFlowChart.data.labels = historicalData.map(h => h.label);
        cashFlowChart.data.datasets[0].data = historicalData.map(h => h.income);
        cashFlowChart.data.datasets[1].data = historicalData.map(h => h.expenses);
        cashFlowChart.update(); // Push canvas updates synchronously
      }

      // 2. Redraw current month category breakdown doughnut data sets
      if (categoryChart) {
        const today = new Date();
        const totals = window.AppStore.getMonthlyTotals(today.getFullYear(), today.getMonth());
        this.updateCategoryChart(totals.categoryBreakdown);
      }
    },

    /**
     * Dynamically updates labels, datasets, and color indexing for the category doughnut chart.
     */
    updateCategoryChart(breakdown) {
      if (!categoryChart) return;

      // Map labels and values lists
      const categories = Object.keys(breakdown);
      const data = Object.values(breakdown);

      // Re-bind properties
      categoryChart.data.labels = categories;
      categoryChart.data.datasets[0].data = data;

      // Color palette mapping configurations
      const categoryPalette = {
        'Rent': '#6366f1',
        'Food': '#10b981',
        'Utilities': '#0ea5e9',
        'Shopping': '#f59e0b',
        'Entertainment': '#ec4899',
        'Travel': '#a855f7',
        'Other': '#6b7280'
      };
      // Map palette colors to index rows
      categoryChart.data.datasets[0].backgroundColor = categories.map(cat => categoryPalette[cat] || '#8b5cf6');
      categoryChart.update(); // Apply changes

      // 3. Update portfolio allocations if active
      if (portfolioChart) {
        const portfolio = window.AppStore.getPortfolio();
        portfolioChart.data.labels = portfolio.map(a => a.symbol);
        portfolioChart.data.datasets[0].data = portfolio.map(a => a.shares * a.currentPrice);
        portfolioChart.update();
      }
    },

    /**
     * Adjusts active grid colours, text labels, and tooltip styling across all charts on theme changes.
     */
    updateTheme() {
      // Exit if Chart library is missing
      if (typeof Chart === 'undefined') return;

      const colors = getThemeColors();

      // Override default options object parameters for new elements
      Chart.defaults.color = colors.text;
      Chart.defaults.plugins.tooltip.backgroundColor = colors.tooltipBg;
      Chart.defaults.plugins.tooltip.titleColor = colors.tooltipText;
      Chart.defaults.plugins.tooltip.bodyColor = colors.tooltipText;
      Chart.defaults.plugins.tooltip.borderColor = colors.tooltipBorder;

      // Iterate through instantiated chart handles
      const charts = [cashFlowChart, categoryChart, portfolioChart];
      charts.forEach(chart => {
        if (!chart) return; // Skip if null
        
        // Re-align axis label text colors and line grid configurations
        if (chart.options.scales) {
          if (chart.options.scales.x) {
            chart.options.scales.x.ticks.color = colors.text;
          }
          if (chart.options.scales.y) {
            chart.options.scales.y.ticks.color = colors.text;
            chart.options.scales.y.grid.color = colors.grid;
          }
        }
        
        // Re-align legend layout color parameters
        if (chart.options.plugins && chart.options.plugins.legend) {
          chart.options.plugins.legend.labels.color = colors.text;
        }

        // Re-align tooltip popups styling parameters
        if (chart.options.plugins && chart.options.plugins.tooltip) {
          chart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
          chart.options.plugins.tooltip.titleColor = colors.tooltipText;
          chart.options.plugins.tooltip.bodyColor = colors.tooltipText;
          chart.options.plugins.tooltip.borderColor = colors.tooltipBorder;
        }

        chart.update(); // Trigger redrawing loops
      });
    }
  };

  // Expose AppCharts to the global window container
  window.AppCharts = AppCharts;
})(window);

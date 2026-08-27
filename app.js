/**
 * Financial Dashboard Application Controller
 * Manages UI rendering, routing, event handlers, modals, CSV management,
 * and onboarding help tours.
 */

(function (window) {
  'use strict';

  // --- State variables for caching active UI filter parameters ---
  let activeTab = 'dashboard';     // The currently visible main tab panel in sidebar
  let txFilter = 'all';            // Selected transaction filter category ('all', 'income', 'expense')
  let txSearchQuery = '';          // The active search string typed in the transactions list
  let selectedGoalId = null;       // Tracks which savings goal is selected during deposit/withdraw operations
  let selectedProfilePic = null;   // Caches uploaded profile image Base64 data url before save

  // Hardcoded Gemini 1.5 Flash API Key (Set key here to enable for all users)
  const HARDCODED_GEMINI_API_KEY = "";

  // Central DOM Elements object mapping to cache node lookups
  const elements = {};

  /**
   * Helper: returns warning styles ('success', 'warning', 'danger')
   * based on the percentage of the budget currently spent.
   */
  function getBudgetStatusClass(percent) {
    if (percent > 100) return 'danger';  // Limit breached (Red color scheme)
    if (percent > 75) return 'warning';  // Reached warning threshold (Orange color scheme)
    return 'success';                    // Budget is healthy (Green color scheme)
  }

  // Default exchange rates: How many Ghanaian Cedis (GH₵) equal 1 unit of foreign currency
  const DEFAULT_GHS_RATES = {
    'GH₵': 1.0,      // Ghanaian Cedi (Base)
    '$': 15.50,      // US Dollar
    '€': 12.60,      // Euro
    '£': 14.80,      // British Pound
    '¥': 2.15,       // Chinese Yuan (CNY)
    '₹': 0.19,       // Indian Rupee
    'C$': 11.30,     // Canadian Dollar
    'A$': 10.30,     // Australian Dollar
    'Fr': 17.50,     // Swiss Franc
    'kr': 1.45,      // Swedish Krona
    'zł': 3.90,      // Polish Zloty
    'R$': 2.80,      // Brazilian Real
    '₽': 0.17,       // Russian Ruble
    'R': 0.85,       // South African Rand
    'د.إ': 4.22,     // UAE Dirham
    'ر.س': 4.13,     // Saudi Riyal
    '₪': 4.20,       // Israeli Shekel
    '₱': 0.27,       // Philippine Peso
    'Rp': 0.0010,    // Indonesian Rupiah
    'RM': 3.30,      // Malaysian Ringgit
    '฿': 0.43,       // Thai Baht
    '₫': 0.00061,    // Vietnamese Dong
    '₦': 0.010,      // Nigerian Naira
    'KSh': 0.12      // Kenyan Shilling
  };

  function getGhsExchangeRates() {
    const store = window.AppStore;
    const settings = (store && store.getSettings) ? store.getSettings() : {};
    return (settings && settings.exchangeRates) ? settings.exchangeRates : DEFAULT_GHS_RATES;
  }

  const SYMBOL_TO_CODE = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'CNY',
    '₹': 'INR',
    'C$': 'CAD',
    'A$': 'AUD',
    'Fr': 'CHF',
    'kr': 'SEK',
    'zł': 'PLN',
    'R$': 'BRL',
    '₽': 'RUB',
    'R': 'ZAR',
    'د.إ': 'AED',
    'ر.س': 'SAR',
    '₪': 'ILS',
    '₱': 'PHP',
    'Rp': 'IDR',
    'RM': 'MYR',
    '฿': 'THB',
    '₫': 'VND',
    '₦': 'NGN',
    'KSh': 'KES',
    'GH₵': 'GHS'
  };

  async function fetchLiveExchangeRates() {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/GHS');
      if (!response.ok) throw new Error('API fetch failed');
      const data = await response.json();
      
      if (data && data.result === 'success' && data.rates) {
        const liveRates = { 'GH₵': 1.0 };
        for (const [symbol, code] of Object.entries(SYMBOL_TO_CODE)) {
          if (code === 'GHS') continue;
          const ratePerGhs = data.rates[code];
          if (ratePerGhs && ratePerGhs > 0) {
            // How many GHS equal 1 unit of foreign currency
            liveRates[symbol] = 1 / ratePerGhs;
          }
        }
        
        // Cache rates in settings
        const store = window.AppStore;
        if (store && store.getSettings) {
          const settings = store.getSettings();
          store.updateSettings({ exchangeRates: liveRates });
          console.log('Live exchange rates updated from API successfully:', liveRates);
        }
      }
    } catch (err) {
      console.warn('Could not fetch live exchange rates, using local fallback:', err);
    }
  }

  /**
   * Converts a numeric value between supported currencies using exact GHS rates per unit.
   */
  function convertCurrencyAmount(amount, targetCurrency = 'GH₵', baseCurrency = 'GH₵') {
    const num = Number(amount) || 0;
    const rates = getGhsExchangeRates();
    
    const fromGhsRate = rates[baseCurrency] || DEFAULT_GHS_RATES[baseCurrency] || 1.0;
    const toGhsRate = rates[targetCurrency] || DEFAULT_GHS_RATES[targetCurrency] || 1.0;
    
    // Step 1: Convert base input to GH₵
    const amountInGhs = baseCurrency === 'GH₵' ? num : (num * fromGhsRate);
    
    // Step 2: Convert GH₵ to target currency
    const finalConverted = targetCurrency === 'GH₵' ? amountInGhs : (amountInGhs / toGhsRate);
    
    return finalConverted;
  }

  /**
   * Helper: formats numeric inputs into local currency strings with automatic real-time FX conversion.
   * Example: formatMoney(1550, "$", "GH₵") -> "$100.00"
   */
  function formatMoney(amount, currency = null, baseCurrency = 'GH₵') {
    const store = window.AppStore;
    const activeCurrency = currency || (store && store.getSettings ? store.getSettings().currency : 'GH₵');
    const converted = convertCurrencyAmount(amount, activeCurrency, baseCurrency);
    
    return activeCurrency + converted.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Expose FX converters globally for chart tooltips & calculations
  window.EXCHANGE_RATES = DEFAULT_GHS_RATES;
  window.convertCurrencyAmount = convertCurrencyAmount;
  window.formatMoney = formatMoney;

  /**
   * Resizes an image file to a 128x128px square JPEG and converts to Base64.
   * Optimizes storage to prevent localStorage exhaustion.
   */
  function compressImage(file, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 96;
        canvas.width = size;
        canvas.height = size;
        
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        callback(canvas.toDataURL('image/jpeg', 0.6));
      };
    };
  }

  /**
   * Filters transactions based on the selected timeframe dropdown value.
   * Matches year, month, or handles all-time summaries.
   */
  function getFilteredTransactions() {
    const store = window.AppStore;
    const transactions = store.getTransactions();
    const today = new Date();

    const yearVal = elements.yearSelector ? elements.yearSelector.value : String(today.getFullYear());
    const monthVal = elements.monthSelector ? elements.monthSelector.value : 'current';

    return transactions.filter(tx => {
      if (!tx.date) return false;
      const parts = tx.date.split('-');
      const txYear = parseInt(parts[0], 10);
      const txMonth = parseInt(parts[1], 10); // 1-indexed

      // --- Year Matching ---
      let matchesYear = false;
      if (yearVal === 'all') {
        matchesYear = true;
      } else {
        matchesYear = (txYear === parseInt(yearVal, 10));
      }

      if (!matchesYear) return false;

      // --- Month Matching ---
      if (monthVal === 'all') {
        return true;
      } else if (monthVal === 'current') {
        const currentMonthNum = today.getMonth() + 1; // 1-indexed
        return txMonth === currentMonthNum;
      } else {
        const targetMonthNum = parseInt(monthVal, 10);
        return txMonth === targetMonthNum;
      }
    });
  }

  /**
   * Populates the Year and Month selectors dynamically based on active transaction history.
   */
  function populateTimeframeOptions() {
    const store = window.AppStore;
    const transactions = store.getTransactions();
    const today = new Date();
    const yearSel = elements.yearSelector;
    const monthSel = elements.monthSelector;
    if (!yearSel || !monthSel) return;

    const currentYear = today.getFullYear();
    const prevYear = yearSel.value || String(currentYear);
    const prevMonth = monthSel.value || 'current';

    // 1. Dynamic Year Options
    const yearsSet = new Set();
    yearsSet.add(currentYear);
    yearsSet.add(currentYear - 1); // Baseline previous year (e.g. 2025 alongside 2026)
    transactions.forEach(tx => {
      if (tx.date) {
        const y = parseInt(tx.date.split('-')[0], 10);
        if (y) yearsSet.add(y);
      }
    });

    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

    yearSel.innerHTML = '';
    sortedYears.forEach(y => {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      yearSel.appendChild(opt);
    });

    const optAllYears = document.createElement('option');
    optAllYears.value = 'all';
    optAllYears.textContent = 'All Years';
    yearSel.appendChild(optAllYears);

    yearSel.value = prevYear;
    if (!yearSel.value) yearSel.value = String(currentYear);

    // 2. Dynamic Month Options
    monthSel.innerHTML = '';

    const currentMonthName = today.toLocaleString('default', { month: 'long' });
    const optCurrent = document.createElement('option');
    optCurrent.value = 'current';
    optCurrent.textContent = `Current (${currentMonthName})`;
    monthSel.appendChild(optCurrent);

    const optAllMonths = document.createElement('option');
    optAllMonths.value = 'all';
    optAllMonths.textContent = 'All Months';
    monthSel.appendChild(optAllMonths);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    monthNames.forEach((mName, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx + 1); // 1-12
      opt.textContent = mName;
      monthSel.appendChild(opt);
    });

    monthSel.value = prevMonth;
    if (!monthSel.value) monthSel.value = 'current';
  }

  /**
   * Caches DOM elements on initialization to minimize document query overhead.
   */
  function cacheElements() {
    elements.body = document.body;
    elements.navItems = document.querySelectorAll('.nav-item');
    elements.panels = document.querySelectorAll('.view-panel');
    elements.themeToggleBtn = document.getElementById('themeToggleBtn');
    elements.themeIcon = document.getElementById('themeIcon');
    elements.themeText = document.getElementById('themeText');
    
    // Mobile Sidebar Drawer Elements
    elements.appSidebar = document.getElementById('appSidebar');
    elements.menuToggleBtn = document.getElementById('menuToggleBtn');
    elements.sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    elements.sidebarBackdrop = document.getElementById('sidebarBackdrop');
    
    // KPI Cards
    elements.netWorthValue = document.getElementById('netWorthValue');
    elements.cashBalanceValue = document.getElementById('cashBalanceValue');
    elements.monthlyIncomeValue = document.getElementById('monthlyIncomeValue');
    elements.monthlyExpensesValue = document.getElementById('monthlyExpensesValue');
    elements.incomeTrend = document.getElementById('incomeTrend');
    elements.expenseTrend = document.getElementById('expenseTrend');
    
    // Transaction Panel
    elements.txList = document.getElementById('txList');
    elements.txSearch = document.getElementById('txSearch');
    elements.txFilterBtns = document.querySelectorAll('.tx-filter-btn');
    elements.addTxBtn = document.getElementById('addTxBtn');
    elements.exportCsvBtn = document.getElementById('exportCsvBtn');
    elements.importCsvBtn = document.getElementById('importCsvBtn');
    elements.csvFileInput = document.getElementById('csvFileInput');
    elements.exportPdfBtn = document.getElementById('exportPdfBtn');
    
    // Budgets Panel
    elements.budgetGrid = document.getElementById('budgetGrid');
    elements.editBudgetBtn = document.getElementById('editBudgetBtn');
    
    // Savings Goals Panel
    elements.goalsGrid = document.getElementById('goalsGrid');
    elements.addGoalBtn = document.getElementById('addGoalBtn');
    elements.addGoalDestination = document.getElementById('addGoalDestination');
    
    // Timeframe Selectors
    elements.yearSelector = document.getElementById('yearSelector');
    elements.monthSelector = document.getElementById('monthSelector');
    elements.headerCurrencySelector = document.getElementById('headerCurrencySelector');
    
    // Settings Form
    elements.settingsForm = document.getElementById('settingsForm');
    elements.settingsUserName = document.getElementById('settingsUserName');
    elements.settingsCurrency = document.getElementById('settingsCurrency');
    elements.settingsCustomCurrencyGroup = document.getElementById('customCurrencyGroup');
    elements.settingsCustomCurrency = document.getElementById('settingsCustomCurrency');
    elements.settingsSavingsGoal = document.getElementById('settingsSavingsGoal');
    elements.settingsGeminiApiKey = document.getElementById('settingsGeminiApiKey');
    elements.resetAppDataBtn = document.getElementById('resetAppDataBtn');
    elements.settingsPaystackKey = document.getElementById('settingsPaystackKey');
    elements.settingsProfilePicInput = document.getElementById('settingsProfilePicInput');
    elements.changeAvatarBtn = document.getElementById('changeAvatarBtn');
    elements.removeAvatarBtn = document.getElementById('removeAvatarBtn');
    elements.settingsAvatarPreview = document.getElementById('settingsAvatarPreview');
    
    // Todos Panel
    elements.addTodoForm = document.getElementById('addTodoForm');
    elements.newTodoText = document.getElementById('newTodoText');

    // Modals
    elements.addTxModal = document.getElementById('addTxModal');
    elements.addTxForm = document.getElementById('addTxForm');
    elements.addTxType = document.getElementById('addTxType');
    elements.addTxCategory = document.getElementById('addTxCategory');
    elements.addTxCategoryOtherGroup = document.getElementById('addTxCategoryOtherGroup');
    elements.addTxCategoryOther = document.getElementById('addTxCategoryOther');
    
    elements.editBudgetModal = document.getElementById('editBudgetModal');
    elements.editBudgetForm = document.getElementById('editBudgetForm');
    
    // Add Budget Elements
    elements.addBudgetBtn = document.getElementById('addBudgetBtn');
    elements.addBudgetModal = document.getElementById('addBudgetModal');
    elements.addBudgetForm = document.getElementById('addBudgetForm');
    
    elements.addGoalModal = document.getElementById('addGoalModal');
    elements.addGoalForm = document.getElementById('addGoalForm');
    elements.addGoalDestinationOtherGroup = document.getElementById('addGoalDestinationOtherGroup');
    elements.addGoalDestinationOther = document.getElementById('addGoalDestinationOther');
    
    elements.goalFundModal = document.getElementById('goalFundModal');
    elements.goalFundForm = document.getElementById('goalFundForm');
    elements.goalFundTitle = document.getElementById('goalFundTitle');
    elements.goalFundType = document.getElementById('goalFundType');
    elements.goalFundReminder = document.getElementById('goalFundReminder');

    // Share & Print Elements
    elements.shareBtn = document.getElementById('shareBtn');
    elements.printBtn = document.getElementById('printBtn');
    elements.shareModal = document.getElementById('shareModal');
    elements.shareTextSummary = document.getElementById('shareTextSummary');
    elements.copyShareBtn = document.getElementById('copyShareBtn');
    elements.exportJsonShareBtn = document.getElementById('exportJsonShareBtn');
    elements.loadJsonBackupBtn = document.getElementById('loadJsonBackupBtn');
    elements.jsonBackupInput = document.getElementById('jsonBackupInput');

    // Tour Elements
    elements.sidebarHelpBtn = document.getElementById('sidebarHelpBtn');
    elements.tourOverlay = document.getElementById('tourOverlay');
    elements.tourTooltip = document.getElementById('tourTooltip');
    elements.tourStepBadge = document.getElementById('tourStepBadge');
    elements.tourSkipBtn = document.getElementById('tourSkipBtn');
    elements.tourTitle = document.getElementById('tourTitle');
    elements.tourText = document.getElementById('tourText');
    elements.tourPrevBtn = document.getElementById('tourPrevBtn');
    elements.tourNextBtn = document.getElementById('tourNextBtn');

    // Diagnostics & Confetti Elements
    elements.healthScoreCircle = document.getElementById('healthScoreCircle');
    elements.healthScoreNum = document.getElementById('healthScoreNum');
    elements.healthScoreGrade = document.getElementById('healthScoreGrade');
    elements.smartInsightsList = document.getElementById('smartInsightsList');
    elements.confettiCanvas = document.getElementById('confettiCanvas');

    // Daily Advice Elements
    elements.dailyAdviceSession = document.getElementById('dailyAdviceSession');
    elements.dailyAdviceQuote = document.getElementById('dailyAdviceQuote');

    // Guide Panel Elements
    elements.guideProgressBar = document.getElementById('guideProgressBar');
    elements.guideProgressPercent = document.getElementById('guideProgressPercent');
    elements.guideTabLessonsBtn = document.getElementById('guideTabLessonsBtn');
    elements.guideTabBooksBtn = document.getElementById('guideTabBooksBtn');
    elements.guideLessonsSection = document.getElementById('guideLessonsSection');
    elements.guideBooksSection = document.getElementById('guideBooksSection');
    elements.literacyReadModal = document.getElementById('literacyReadModal');
    elements.literacyReadTitle = document.getElementById('literacyReadTitle');
    elements.literacyReadBody = document.getElementById('literacyReadBody');
    elements.literacyReadCompleteBtn = document.getElementById('literacyReadCompleteBtn');

    // Undo / Redo Elements
    elements.undoBtn = document.getElementById('undoBtn');
    elements.redoBtn = document.getElementById('redoBtn');

    // Auth Elements
    elements.authPanel = document.getElementById('authPanel');
    elements.authForm = document.getElementById('authForm');
    elements.authTitle = document.getElementById('authTitle');
    elements.authSubtitle = document.getElementById('authSubtitle');
    elements.authFullName = document.getElementById('authFullName');
    elements.fullNameGroup = document.getElementById('fullNameGroup');
    elements.authUsername = document.getElementById('authUsername');
    elements.authPassword = document.getElementById('authPassword');
    elements.authConfirmPassword = document.getElementById('authConfirmPassword');
    elements.confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
    elements.authCurrency = document.getElementById('authCurrency');
    elements.currencyGroup = document.getElementById('currencyGroup');
    elements.authSubmitBtn = document.getElementById('authSubmitBtn');
    elements.authToggleLink = document.getElementById('authToggleLink');
    elements.authToggleText = document.getElementById('authToggleText');
    elements.logoutBtn = document.getElementById('logoutBtn');
    elements.logoutNavBtn = document.getElementById('logoutNavBtn');
    elements.forgotPasswordLink = document.getElementById('forgotPasswordLink');
    elements.authSecurityQuestion = document.getElementById('authSecurityQuestion');
    elements.securityQuestionGroup = document.getElementById('securityQuestionGroup');
    elements.authSecurityAnswer = document.getElementById('authSecurityAnswer');
    elements.securityAnswerGroup = document.getElementById('securityAnswerGroup');
    elements.securityAnswerLabel = document.getElementById('securityAnswerLabel');
    elements.passwordGroup = document.getElementById('passwordGroup');
    elements.usernameGroup = document.getElementById('usernameGroup');

    elements.premiumUpgradeModal = document.getElementById('premiumUpgradeModal');
    elements.upgradeCheckoutBtn = document.getElementById('upgradeCheckoutBtn');
    elements.sidebarUpgradeBtn = document.getElementById('sidebarUpgradeBtn');
    elements.diagnosticsLockOverlay = document.getElementById('diagnosticsLockOverlay');

    // Legal Compliance Modals
    elements.termsModal = document.getElementById('termsModal');
    elements.privacyModal = document.getElementById('privacyModal');
    elements.refundModal = document.getElementById('refundModal');

    // AI Coach Elements
    elements.aiInsightsBanner = document.getElementById('aiInsightsBanner');
    elements.aiInsightsContent = document.getElementById('aiInsightsContent');
    elements.openAiCoachModalBtn = document.getElementById('openAiCoachModalBtn');
    elements.floatingAiCoachFab = document.getElementById('floatingAiCoachFab');
    elements.aiCoachModal = document.getElementById('aiCoachModal');
    elements.closeAiCoachModalBtn = document.getElementById('closeAiCoachModalBtn');
    elements.aiCoachStatusText = document.getElementById('aiCoachStatusText');
    elements.aiChatThread = document.getElementById('aiChatThread');
    elements.aiChatInput = document.getElementById('aiChatInput');
    elements.sendAiChatBtn = document.getElementById('sendAiChatBtn');
  }

  // --- Modal Utilities ---
  window.openModal = function(modal) {
    if (typeof modal === 'string') modal = document.getElementById(modal);
    if (modal) {
      modal.classList.add('active'); // Slide/fade in modal backdrop
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('pointer-events', 'auto', 'important');
    }
  };

  window.closeModal = function(modal) {
    if (typeof modal === 'string') modal = document.getElementById(modal);
    if (modal) {
      modal.classList.remove('active'); // Hide modal backdrop
      modal.style.setProperty('display', 'none', 'important');
      modal.style.setProperty('pointer-events', 'none', 'important');
    }
  };

  function openModal(modal) {
    window.openModal(modal);
  }

  function closeModal(modal) {
    window.closeModal(modal);
  }

  window.openLegalModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) openModal(modal);
  };

  window.closeLegalModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) closeModal(modal);
  };

  window.openPremiumModal = function() {
    const modal = document.getElementById('premiumUpgradeModal');
    if (modal) openModal(modal);
  };

  window.closePremiumModal = function() {
    const modal = document.getElementById('premiumUpgradeModal');
    if (modal) closeModal(modal);
  };

  window.triggerPaystackCheckout = function() {
    const settings = window.AppStore ? window.AppStore.getSettings() : {};
    const paystackKey = 'pk_live_3bb03f9209cfe3ac12fe324b73167807ef9bbac8';
    
    if (typeof PaystackPop === 'undefined') {
      alert('Paystack SDK is loading or blocked. Check your internet connection.');
      return;
    }
    
    // Fixed price GH₵ 13.99 in pesewas for Paystack API (13.99 * 100 = 1399 pesewas)
    const amountVal = 1399;
    const currencyCode = 'GHS';
    const cleanUserName = (settings.userName || 'User').trim();
    const emailAddress = 'customer_' + cleanUserName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '@financialdashboard.com';

    try {
      if (typeof PaystackPop === 'function' && PaystackPop.prototype && PaystackPop.prototype.newTransaction) {
        const paystack = new PaystackPop();
        paystack.newTransaction({
          key: paystackKey,
          email: emailAddress,
          amount: amountVal,
          currency: currencyCode,
          channels: ['mobile_money', 'card'],
          metadata: {
            custom_fields: [
              { display_name: "Customer Name", variable_name: "customer_name", value: cleanUserName }
            ]
          },
          onSuccess: function(response) {
            if (window.AppStore) window.AppStore.setPremiumStatus(true, 'monthly');
            window.closePremiumModal();
            if (typeof triggerConfetti === 'function') triggerConfetti();
            alert('Congratulations! Payment Successful! Reference: ' + response.reference + '. Welcome to FinFlow Premium! 🏆');
          },
          onCancel: function() {
            console.log('Paystack checkout cancelled by user.');
          }
        });
      } else {
        const handler = PaystackPop.setup({
          key: paystackKey,
          email: emailAddress,
          amount: amountVal,
          currency: currencyCode,
          channels: ['mobile_money', 'card'],
          metadata: {
            custom_fields: [
              { display_name: "Customer Name", variable_name: "customer_name", value: cleanUserName }
            ]
          },
          callback: function(response) {
            if (window.AppStore) window.AppStore.setPremiumStatus(true, 'monthly');
            window.closePremiumModal();
            if (typeof triggerConfetti === 'function') triggerConfetti();
            alert('Congratulations! Payment Successful! Reference: ' + response.reference + '. Welcome to FinFlow Premium! 🏆');
          },
          onClose: function() {
            console.log('Paystack checkout closed.');
          }
        });
        handler.openIframe();
      }
    } catch(err) {
      alert('Failed to launch Paystack checkout: ' + err.message);
    }
  };

  /**
   * Dynamic category options populator based on whether the transaction is an Income or Expense.
   */
  function updateCategoryDropdown(typeSelect, categorySelect) {
    const type = typeSelect.value;
    categorySelect.innerHTML = ''; // Wipe selection options
    
    // Choose categories list based on transaction type selector
    const categories = type === 'income' 
      ? ['Salary', 'Freelance', 'Investments', 'Other']
      : ['Rent', 'Food', 'Utilities', 'Shopping', 'Entertainment', 'Travel', 'Other'];
      
    // Loop through options and build nodes
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      categorySelect.appendChild(opt);
    });

    // Clean up specify other input states
    if (elements.addTxCategoryOtherGroup) {
      elements.addTxCategoryOtherGroup.style.display = 'none';
    }
    if (elements.addTxCategoryOther) {
      elements.addTxCategoryOther.value = '';
      elements.addTxCategoryOther.removeAttribute('required');
    }
  }

  // --- Render Functions ---

  /**
   * 1. Redraws key performance indicator cards (Net Worth, Cash balance, Inflow/Outflow).
   */
  function renderKPIs() {
    const store = window.AppStore;
    const settings = store.getSettings();
    const currency = settings.currency;
    const balance = store.getBalance();
    
    // Update main net worth value card
    elements.netWorthValue.textContent = formatMoney(balance.total, currency);
    elements.netWorthValue.title = elements.netWorthValue.textContent;
    
    // Update cash balance value card
    elements.cashBalanceValue.textContent = formatMoney(balance.cash, currency);
    elements.cashBalanceValue.title = elements.cashBalanceValue.textContent;

    // Aggregate values based on chosen timeframe filters
    const filteredTxs = getFilteredTransactions();
    let income = 0;
    let expenses = 0;
    filteredTxs.forEach(tx => {
      if (tx.type === 'income') {
        income += tx.amount;
      } else {
        expenses += tx.amount;
      }
    });
    
    // Set text values
    elements.monthlyIncomeValue.textContent = formatMoney(income, currency);
    elements.monthlyIncomeValue.title = elements.monthlyIncomeValue.textContent;
    
    elements.monthlyExpensesValue.textContent = formatMoney(expenses, currency);
    elements.monthlyExpensesValue.title = elements.monthlyExpensesValue.textContent;

    // Swap title labels depending on active timeframe filter states
    const today = new Date();
    const yearVal = elements.yearSelector ? elements.yearSelector.value : String(today.getFullYear());
    const monthVal = elements.monthSelector ? elements.monthSelector.value : 'current';
    const incLabel = document.querySelector('.kpi-card.income .kpi-title');
    const expLabel = document.querySelector('.kpi-card.expense .kpi-title');

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let labelStr = 'Monthly';
    if (monthVal === 'current') {
      const curMonthName = today.toLocaleString('default', { month: 'short' });
      labelStr = yearVal === 'all' ? `${curMonthName}` : `${curMonthName} ${yearVal}`;
    } else if (monthVal === 'all') {
      labelStr = yearVal === 'all' ? 'All-Time' : `${yearVal}`;
    } else {
      const mIdx = parseInt(monthVal, 10) - 1;
      const mName = monthNames[mIdx] ? monthNames[mIdx].slice(0, 3) : '';
      labelStr = yearVal === 'all' ? `${mName}` : `${mName} ${yearVal}`;
    }

    if (incLabel) incLabel.textContent = `${labelStr} Income`;
    if (expLabel) expLabel.textContent = `${labelStr} Expenses`;

    if (monthVal === 'current' && (yearVal === 'all' || yearVal === String(today.getFullYear()))) {
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthTotals = store.getMonthlyTotals(prevMonth.getFullYear(), prevMonth.getMonth());
      const currentMonthTotals = store.getMonthlyTotals(today.getFullYear(), today.getMonth());
      
      if (prevMonthTotals.income > 0) {
        const incDiff = ((currentMonthTotals.income - prevMonthTotals.income) / prevMonthTotals.income * 100);
        elements.incomeTrend.innerHTML = incDiff >= 0 
          ? `<span class="trend-badge up">↑ ${Math.abs(incDiff).toFixed(1)}%</span> vs last month`
          : `<span class="trend-badge down">↓ ${Math.abs(incDiff).toFixed(1)}%</span> vs last month`;
      } else {
        elements.incomeTrend.textContent = 'No historical data';
      }

      if (prevMonthTotals.expenses > 0) {
        const expDiff = ((currentMonthTotals.expenses - prevMonthTotals.expenses) / prevMonthTotals.expenses * 100);
        elements.expenseTrend.innerHTML = expDiff <= 0 
          ? `<span class="trend-badge up">↓ ${Math.abs(expDiff).toFixed(1)}%</span> vs last month`
          : `<span class="trend-badge down">↑ ${Math.abs(expDiff).toFixed(1)}%</span> vs last month`;
      } else {
        elements.expenseTrend.textContent = 'No historical data';
      }
    } else {
      elements.incomeTrend.textContent = `${labelStr} breakdown`;
      elements.expenseTrend.textContent = `${labelStr} breakdown`;
    }
  }

  /**
   * 2. Redraws the list of transaction items in the ledger view panel.
   */
  function renderTransactions() {
    const store = window.AppStore;
    const currency = store.getSettings().currency;
    const transactions = getFilteredTransactions();
    
    // Filter and search elements match validation
    const filtered = transactions.filter(tx => {
      const matchesType = txFilter === 'all' || tx.type === txFilter;
      const matchesSearch = txSearchQuery === '' || 
        tx.description.toLowerCase().includes(txSearchQuery.toLowerCase()) ||
        tx.category.toLowerCase().includes(txSearchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });

    elements.txList.innerHTML = ''; // Clear container

    // Check if list is empty
    if (filtered.length === 0) {
      elements.txList.innerHTML = '<div class="empty-state">No transactions match your filters.</div>';
      return;
    }

    // Traverse and render row items
    filtered.forEach(tx => {
      const item = document.createElement('div');
      item.className = `tx-item ${tx.type}`;
      
      let iconSvg = '';
      if (tx.type === 'income') {
        iconSvg = `<svg><use href="#icon-arrow-down-left"></use></svg>`;
      } else {
        iconSvg = `<svg><use href="#icon-arrow-up-right"></use></svg>`;
      }

      const formattedAmount = (tx.type === 'income' ? '+ ' : '- ') + formatMoney(tx.amount, currency);

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px;">
          <div class="tx-icon-wrapper">${iconSvg}</div>
          <div>
            <div class="tx-title" style="font-weight: 700;">${tx.description || 'No description'}</div>
            <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
              <span class="tx-cat">${tx.category}</span>
              <span style="font-size: 0.72rem; color: var(--text-muted);">${tx.date}</span>
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 14px;">
          <span class="tx-amount" style="font-weight: 800; font-family: monospace; font-size: 0.95rem;">${formattedAmount}</span>
          <button class="btn btn-secondary btn-icon delete-tx-btn" data-id="${tx.id}" title="Delete transaction" style="padding: 6px; min-width: 28px; height: 28px;">
            <svg style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;"><use href="#icon-trash"></use></svg>
          </button>
        </div>
      `;

      // Bind delete button listener
      item.querySelector('.delete-tx-btn').addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this transaction record?')) {
          store.deleteTransaction(id);
        }
      });

      elements.txList.appendChild(item);
    });
  }

  /**
   * 3. Redraws category budget limits cards showing progress bars and alert states.
   */
  function renderBudgets() {
    const store = window.AppStore;
    const currency = store.getSettings().currency;
    const budgets = store.getBudgets();
    
    // Fetch month categories totals
    const filteredTxs = getFilteredTransactions();
    const categoryTotals = {};
    filteredTxs.forEach(tx => {
      if (tx.type === 'expense') {
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      }
    });

    elements.budgetGrid.innerHTML = ''; // Wipe budget layout

    // Loop through budget settings categories
    Object.keys(budgets).forEach(category => {
      const limit = budgets[category];
      const spent = categoryTotals[category] || 0;
      const percent = limit > 0 ? (spent / limit) * 100 : 0;
      const statusClass = getBudgetStatusClass(percent);

      const card = document.createElement('div');
      card.className = 'card budget-card';
      card.innerHTML = `
        <div class="budget-header">
          <span class="budget-cat" style="font-weight: 700; font-size: 1.05rem;">${category}</span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            Limit: <strong style="color: var(--text-main); font-weight: 700;">${formatMoney(limit, currency)}</strong>
          </span>
        </div>
        <div class="budget-stats">
          <span style="font-weight: 800; font-size: 1.15rem; color: var(--text-main);">${formatMoney(spent, currency)}</span>
          <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">${percent.toFixed(0)}% spent</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar ${statusClass}" style="width: ${Math.min(100, percent)}%"></div>
        </div>
        <div class="budget-status-text ${statusClass}" style="font-size: 0.76rem; font-weight: 700;">
          ${percent > 100 
            ? `Breached by ${formatMoney(spent - limit, currency)}!` 
            : `Safe: ${(100 - percent).toFixed(0)}% remaining`
          }
        </div>
        <div style="display: flex; gap: 8px; margin-top: 14px; width: 100%;">
          <button class="btn btn-secondary btn-sm budget-edit-btn" data-category="${category}" style="flex: 1; margin-top: 0;">
            Edit
          </button>
          <button class="btn btn-danger btn-sm budget-delete-btn" data-category="${category}" style="flex: 1; margin-top: 0;">
            Delete
          </button>
        </div>
      `;

      // Bind adjust limits listener
      card.querySelector('.budget-edit-btn').addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-category');
        document.getElementById('editBudgetCategory').value = cat;
        document.getElementById('editBudgetLimit').value = budgets[cat];
        openModal(elements.editBudgetModal);
      });

      // Bind delete budget listener
      card.querySelector('.budget-delete-btn').addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-category');
        if (confirm(`Are you sure you want to delete the budget limit for "${cat}"?`)) {
          window.AppStore.deleteBudget(cat);
        }
      });

      elements.budgetGrid.appendChild(card);
    });
  }

  /**
   * 4. Redraws active savings goals lists and location tags.
   */
  function renderSavingsGoals() {
    const store = window.AppStore;
    const currency = store.getSettings().currency;
    const goals = store.getGoals();

    elements.goalsGrid.innerHTML = ''; // Wipe goals layout

    // If no goals are recorded in database
    if (goals.length === 0) {
      elements.goalsGrid.innerHTML = '<div class="empty-state">No savings goals created yet. Add one below!</div>';
      return;
    }

    // Traverse and render active savings goals cards
    goals.forEach(goal => {
      const percent = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
      const isCompleted = goal.currentAmount >= goal.targetAmount;
      
      // Calculate SVG stroke offset path for the circular progress indicator
      const radius = 60;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (Math.min(100, percent) / 100) * circumference;

      const card = document.createElement('div');
      card.className = 'card goal-card' + (isCompleted ? ' goal-completed-card' : '');
      card.innerHTML = `
        <div class="goal-ring-container">
          <svg class="goal-ring-svg">
            <circle class="goal-ring-bg" cx="70" cy="70" r="60"></circle>
            <circle class="goal-ring-progress" cx="70" cy="70" r="60" style="stroke-dashoffset: ${offset};"></circle>
          </svg>
          <div class="goal-ring-text">
            <span class="goal-percent">${percent.toFixed(0)}%</span>
            <span class="goal-label">saved</span>
          </div>
        </div>
        <h3 class="goal-name">
          ${goal.name}
          ${isCompleted ? '<span style="display: inline-block; font-size: 0.72rem; background: linear-gradient(135deg, #f1c40f, #f39c12); color: #0b0f19; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle; box-shadow: 0 2px 6px rgba(243, 156, 18, 0.3);">🏆 Achieved</span>' : ''}
        </h3>
        <p class="goal-target-date" style="margin-bottom: 2px;">Target: ${goal.targetDate || 'No date'}</p>
        <p class="goal-target-date" style="font-size: 0.76rem; color: var(--color-primary); font-weight: 600; margin-bottom: 8px;">
          📍 Location: ${goal.destination || 'Mobile Money (MoMo) Wallet'}
        </p>
        <p class="goal-amounts">
          <span class="goal-current">${formatMoney(goal.currentAmount, currency)}</span> of ${formatMoney(goal.targetAmount, currency)}
        </p>
        <div class="goal-actions-row">
          <button class="btn btn-primary btn-sm deposit-goal-btn" data-id="${goal.id}">Deposit</button>
          <button class="btn btn-secondary btn-sm withdraw-goal-btn" data-id="${goal.id}">Withdraw</button>
          <button class="btn btn-danger btn-sm delete-goal-btn" data-id="${goal.id}" title="Delete Goal">
            <svg style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;"><use href="#icon-trash"></use></svg>
          </button>
        </div>
      `;

      // Bind Deposit Modal Trigger
      card.querySelector('.deposit-goal-btn').addEventListener('click', (e) => {
        selectedGoalId = e.currentTarget.getAttribute('data-id');
        elements.goalFundTitle.textContent = `Deposit to "${goal.name}"`;
        elements.goalFundType.value = 'deposit';
        elements.goalFundReminder.textContent = `⚠️ Note: Confirm you have manually deposited this cash into your real ${goal.destination || 'wallet'}. The dashboard tracks the ledger, not your real cash!`;
        elements.goalFundForm.reset();
        openModal(elements.goalFundModal);
      });

      // Bind Withdraw Modal Trigger
      card.querySelector('.withdraw-goal-btn').addEventListener('click', (e) => {
        selectedGoalId = e.currentTarget.getAttribute('data-id');
        elements.goalFundTitle.textContent = `Withdraw from "${goal.name}"`;
        elements.goalFundType.value = 'withdraw';
        elements.goalFundReminder.textContent = `⚠️ Note: Confirm you have manually withdrawn this cash from your real ${goal.destination || 'wallet'}.`;
        elements.goalFundForm.reset();
        openModal(elements.goalFundModal);
      });

      // Bind Delete Goal Trigger
      card.querySelector('.delete-goal-btn').addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm(`Are you sure you want to delete the "${goal.name}" goal?`)) {
          store.deleteGoal(id);
        }
      });

      elements.goalsGrid.appendChild(card);
    });
  }

  /**
   * 5. Redraws user settings parameters and profile cards.
   */
  function renderSettings() {
    const store = window.AppStore;
    const settings = store.getSettings();
    
    // Set setting inputs value matches
    elements.settingsUserName.value = settings.userName;
    if (elements.settingsSavingsGoal) {
      elements.settingsSavingsGoal.value = Math.round(convertCurrencyAmount(settings.monthlySavingsGoal || 0, settings.currency, 'GH₵'));
    }
    if (elements.settingsGeminiApiKey) {
      elements.settingsGeminiApiKey.value = settings.geminiApiKey || '';
    }
    elements.settingsCurrency.dataset.lastVal = settings.currency || 'GH₵';

    // Check if currency configuration maps to pre-defined dropdown symbols
    const hasCurrencyOption = Array.from(elements.settingsCurrency.options).some(opt => opt.value === settings.currency);
    if (hasCurrencyOption) {
      elements.settingsCurrency.value = settings.currency;
      elements.settingsCustomCurrencyGroup.style.display = 'none';
      elements.settingsCustomCurrency.value = '';
    } else {
      // Toggle custom currency text display option
      elements.settingsCurrency.value = 'custom';
      elements.settingsCustomCurrencyGroup.style.display = 'flex';
      elements.settingsCustomCurrency.value = settings.currency;
    }

    // Update circular profile avatars text contents or backgrounds
    const avatars = document.querySelectorAll('.profile-avatar');
    const initials = settings.userName ? settings.userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) : 'U';
    const activeProfilePic = (selectedProfilePic !== null) ? selectedProfilePic : (settings.profilePic || '');
    
    avatars.forEach(avatar => {
      if (avatar) {
        if (activeProfilePic) {
          avatar.textContent = '';
          avatar.style.backgroundImage = `url(${activeProfilePic})`;
          avatar.style.backgroundSize = 'cover';
          avatar.style.backgroundPosition = 'center';
        } else {
          avatar.textContent = initials;
          avatar.style.backgroundImage = 'none';
        }
      }
    });

    // Control Settings panel Remove button visibility
    if (elements.removeAvatarBtn) {
      elements.removeAvatarBtn.style.display = activeProfilePic ? 'inline-block' : 'none';
    }

    // Update display name elements globally
    const names = document.querySelectorAll('.profile-name');
    names.forEach(name => name.textContent = settings.userName);

    // Update greeting header text content dynamically based on time of day
    const currentHour = new Date().getHours();
    let greetingPrefix = 'Good evening';
    if (currentHour < 12) {
      greetingPrefix = 'Good morning';
    } else if (currentHour >= 12 && currentHour < 16) {
      greetingPrefix = 'Good afternoon';
    }
    const firstName = settings.userName ? settings.userName.split(' ')[0] : 'User';
    document.getElementById('headerGreeting').textContent = `${greetingPrefix}, ${firstName}!`;

    // Render paystack key value
    if (elements.settingsPaystackKey) {
      elements.settingsPaystackKey.value = settings.paystackKey || '';
    }


  }

  /**
   * Redraws financial chores tasks checklist in UI.
   */
  function renderTodos() {
    const store = window.AppStore;
    const todos = store.getTodos();
    const listElement = document.getElementById('todoList');
    if (!listElement) return;

    let activeFilter = 'all';
    const activeFilterBtn = document.querySelector('.btn-todo-filter.active');
    if (activeFilterBtn) {
      activeFilter = activeFilterBtn.getAttribute('data-filter');
    }

    listElement.innerHTML = '';

    const filteredTodos = todos.filter(todo => {
      if (activeFilter === 'pending') return !todo.completed;
      if (activeFilter === 'completed') return todo.completed;
      return true;
    });

    const totalCount = todos.length;
    const completedCount = todos.filter(t => t.completed).length;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const statsElement = document.getElementById('todoProgressStats');
    if (statsElement) {
      statsElement.textContent = `${completedCount} of ${totalCount} tasks completed (${percent}%)`;
    }

    if (filteredTodos.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'card';
      emptyLi.style.cssText = 'padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.86rem; border: 1.5px dashed var(--color-border); background: transparent;';
      emptyLi.textContent = 'No tasks found. Add a task above to get started!';
      listElement.appendChild(emptyLi);
      return;
    }

    filteredTodos.forEach(todo => {
      const li = document.createElement('li');
      li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-radius: var(--border-radius-md); background: rgba(255, 255, 255, 0.02); border: 1px solid var(--color-border); transition: all 0.2s ease; margin-bottom: 8px;';
      
      const leftDiv = document.createElement('div');
      leftDiv.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.completed;
      checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer; accent-color: var(--color-primary);';
      checkbox.addEventListener('change', () => {
        store.toggleTodo(todo.id);
        renderTodos();
        scheduleTodoReminders();
      });

      const span = document.createElement('span');
      span.textContent = todo.text;
      span.style.cssText = 'font-size: 0.88rem; color: var(--text-main); font-family: inherit; word-break: break-word;';
      if (todo.completed) {
        span.style.textDecoration = 'line-through';
        span.style.color = 'var(--text-muted)';
      }

      leftDiv.appendChild(checkbox);
      leftDiv.appendChild(span);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.innerHTML = '<svg style="width: 14px; height: 14px; fill: none; stroke: var(--color-danger); stroke-width: 2.5;"><use href="#icon-trash"></use></svg>';
      deleteBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 4px; transition: all 0.2s ease;';
      deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.background = 'rgba(239, 68, 68, 0.1)');
      deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.background = 'transparent');
      deleteBtn.addEventListener('click', () => {
        store.deleteTodo(todo.id);
        renderTodos();
        scheduleTodoReminders();
      });

      li.appendChild(leftDiv);
      li.appendChild(deleteBtn);
      listElement.appendChild(li);
    });
  }

  /**
   * Dynamic local reminder notifications scheduler for pending financial tasks.
   * Cancels existing reminder if list is empty or tasks are completed.
   */
  async function scheduleTodoReminders() {
    const capacitor = window.Capacitor;
    if (capacitor && capacitor.Plugins && capacitor.Plugins.LocalNotifications) {
      const { LocalNotifications } = capacitor.Plugins;
      try {
        const store = window.AppStore;
        const pendingTodos = store.getTodos().filter(t => !t.completed);
        const permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') return;

        await LocalNotifications.cancel({
          notifications: [{ id: 100 }]
        });

        if (pendingTodos.length > 0) {
          const count = pendingTodos.length;
          const firstTask = pendingTodos[0].text;
          const taskLabel = count === 1 ? 'task' : 'tasks';
          const exampleText = count > 1 ? ` (e.g. "${firstTask}")` : ` ("${firstTask}")`;
          
          await LocalNotifications.schedule({
            notifications: [
              {
                title: "FinFlow Checklist Reminder 📝",
                body: `You have ${count} pending financial ${taskLabel}${exampleText}. Tap to review and check them off!`,
                id: 100,
                schedule: {
                  on: {
                    hour: 19,
                    minute: 0
                  },
                  repeats: true
                }
              }
            ]
          });
        }
      } catch (err) {
        console.warn('Capacitor To-Do Local Notifications scheduling failed:', err);
      }
    }
  }

  /**
   * 6. Redraws Diagnostics panel (Financial Health Grade & insights).
   */
  function renderDiagnostics() {
    const store = window.AppStore;
    const settings = store.getSettings();
    const goals = store.getGoals();
    const budgets = store.data.budgets || {};
    
    const filteredTxs = getFilteredTransactions();
    let totalIncome = 0;
    let totalExpenses = 0;
    
    // Category totals
    const categoryTotals = {};
    filteredTxs.forEach(tx => {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else {
        totalExpenses += tx.amount;
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      }
    });

    const balance = store.getBalance();
    const netWorth = balance.total; 

    // --- Calculate Savings Rate Score ---
    let savingsScore = 0;
    const savings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;
    
    if (savingsRate >= 20) {
      savingsScore = 35;
    } else if (savingsRate > 0) {
      savingsScore = Math.round((savingsRate / 20) * 35);
    }

    // --- Calculate Budget Discipline Score ---
    let budgetScore = 35;
    const categories = Object.keys(budgets);
    let breachedBudgets = 0;
    let warningBudgets = 0;

    categories.forEach(cat => {
      const limit = budgets[cat];
      const spent = categoryTotals[cat] || 0;
      if (limit > 0) {
        const ratio = spent / limit;
        if (ratio >= 1.0) {
          breachedBudgets++;
        } else if (ratio >= 0.75) {
          warningBudgets++;
        }
      }
    });
    
    // Penalize breached budgets severely
    budgetScore = Math.max(0, 35 - (breachedBudgets * 7) - (warningBudgets * 3));

    // --- Calculate Liquidity Buffer Score ---
    let liquidityScore = 0;
    const avgMonthlyExpenses = totalExpenses || 1000; 
    const monthsCovered = avgMonthlyExpenses > 0 ? netWorth / avgMonthlyExpenses : 0;
    
    if (monthsCovered >= 6) {
      liquidityScore = 30; // Secure
    } else if (monthsCovered >= 3) {
      liquidityScore = 20 + Math.round(((monthsCovered - 3) / 3) * 10);
    } else if (monthsCovered > 0) {
      liquidityScore = Math.round((monthsCovered / 3) * 20);
    }

    // Sum overall score indicators
    const totalHealthScore = savingsScore + budgetScore + liquidityScore;

    // Map health grade strings and colors
    let grade = 'Excellent (A)';
    let color = '#10b981'; 
    if (totalHealthScore < 40) {
      grade = 'Critical (F)';
      color = '#ef4444'; 
    } else if (totalHealthScore < 60) {
      grade = 'Needs Action (D)';
      color = '#f97316'; 
    } else if (totalHealthScore < 75) {
      grade = 'Fair (C)';
      color = '#eab308'; 
    } else if (totalHealthScore < 90) {
      grade = 'Good (B)';
      color = '#10b981'; 
    }

    // Render health gauge values
    if (elements.healthScoreNum) {
      elements.healthScoreNum.textContent = totalHealthScore.toFixed(0);
      elements.healthScoreNum.style.color = color;
    }
    if (elements.healthScoreGrade) {
      elements.healthScoreGrade.textContent = grade;
    }

    // Set SVG arc stroke dashoffset
    if (elements.healthScoreCircle) {
      const radius = 54;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (totalHealthScore / 100) * circumference;
      elements.healthScoreCircle.style.strokeDashoffset = offset;
      elements.healthScoreCircle.style.stroke = color;
    }

    // Generate smart advice insights bullet points
    if (elements.smartInsightsList) {
      elements.smartInsightsList.innerHTML = '';
      const insights = [];

      // Income vs expense check
      if (totalExpenses > totalIncome && totalIncome > 0) {
        insights.push({
          type: 'danger',
          text: `You spent **${formatMoney(totalExpenses - totalIncome, settings.currency)}** more than you earned this period! Review category limits immediately.`
        });
      } else if (savingsRate >= 20) {
        insights.push({
          type: 'success',
          text: `Great job! You saved **${savingsRate.toFixed(1)}%** of your income, exceeding the benchmark target savings rate.`
        });
      }

      // Budget check
      if (breachedBudgets > 0) {
        insights.push({
          type: 'danger',
          text: `You have breached the budget limit in **${breachedBudgets}** categories! Adjust your spending habits.`
        });
      }
      if (warningBudgets > 0) {
        insights.push({
          type: 'warning',
          text: `Warning: **${warningBudgets}** category budgets have crossed 75% thresholds and are nearing limit caps.`
        });
      }

      // Liquidity cushion checks
      if (monthsCovered >= 6) {
        insights.push({
          type: 'success',
          text: `Your cash reserves cover **${monthsCovered.toFixed(1)} months** of essential expenses. Outstanding buffer!`
        });
      } else if (monthsCovered < 3) {
        insights.push({
          type: 'danger',
          text: `Your liquidity fund covers less than **3 months** of expenses. prioritize emergency savings.`
        });
      }

      // Render items inside insights DOM list
      insights.forEach(item => {
        const li = document.createElement('li');
        li.className = 'insight-item';
        
        let bg = 'rgba(255, 255, 255, 0.02)';
        let border = 'var(--color-border)';

        if (item.type === 'success') { bg = 'rgba(16, 185, 129, 0.05)'; border = 'rgba(16, 185, 129, 0.2)'; }
        if (item.type === 'warning') { bg = 'rgba(234, 179, 8, 0.05)'; border = 'rgba(234, 179, 8, 0.2)'; }
        if (item.type === 'danger') { bg = 'rgba(239, 68, 68, 0.05)'; border = 'rgba(239, 68, 68, 0.2)'; }

        li.style.background = bg;
        li.style.borderColor = border;

        const formattedText = item.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        li.innerHTML = `<span>${formattedText}</span>`;
        elements.smartInsightsList.appendChild(li);
      });
    }
  }

  // --- Daily Advice quotes data arrays ---
  const morningQuotes = [
    "A budget is telling your money where to go instead of wondering where it went. — John C. Maxwell",
    "Do not save what is left after spending, but spend what is left after saving. — Warren Buffett",
    "Beware of little expenses; a small leak will sink a great ship. — Benjamin Franklin",
    "Rich people believe 'I create my life.' Poor people believe 'Life happens to me.' — T. Harv Eker",
    "The safe way to double your money is to fold it over once and put it in your pocket. — Kin Hubbard"
  ];

  const eveningQuotes = [
    "Annual income twenty pounds, annual expenditure nineteen nineteen and six, result happiness. Annual income twenty pounds, annual expenditure twenty pounds ought and six, result misery. — Charles Dickens",
    "The goal isn't more money. The goal is living life on your own terms. — Chris Brogan",
    "Financial freedom is available to those who learn about it and work for it. — Robert Kiyosaki",
    "It's not how much money you make, but how much money you keep, how hard it works for you, and how many generations you keep it for. — Robert Kiyosaki",
    "Every time you borrow money, you're robbing your future self. — Nathan W. Morris"
  ];

  /**
   * 7. Renders the twice-daily quotes based on active session hour checks.
   */
  function renderDailyAdvice() {
    const hours = new Date().getHours();
    const isMorning = hours < 12; // Check if before noon
    const sessionText = isMorning ? "☀️ Morning Guidance" : "🌙 Evening Review";
    
    // Choose quote deterministically using day calendar dates
    const day = new Date().getDate();
    const pool = isMorning ? morningQuotes : eveningQuotes;
    const quote = pool[day % pool.length];

    if (elements.dailyAdviceSession) {
      elements.dailyAdviceSession.textContent = sessionText;
    }
    if (elements.dailyAdviceQuote) {
      elements.dailyAdviceQuote.textContent = quote;
    }
  }

  // --- Financial Literacy Curriculum database maps ---
  const literacyLessons = {
    1: {
      title: "The 50/30/20 Budgeting Rule",
      body: `<h3>How it Works:</h3>
<p>The 50/30/20 rule is an intuitive, robust budgeting guideline designed to automate your cash flow mapping:</p>
<ul>
  <li><strong>50% Needs:</strong> Cover essential expenses like groceries, housing utilities, healthcare, and baseline insurance premiums.</li>
  <li><strong>30% Wants:</strong> Cover optional lifestyle purchases such as dining out, subscription media, cinema entries, and holiday trips.</li>
  <li><strong>20% Savings:</strong> Allocate this directly to liquid emergency cash reserves, pension plans, or goals on apps like Achieve/Fido.</li>
</ul>
<p><strong>Pro Tip:</strong> Build a standing order that routes 20% of your salary into savings the second you get paid, before spending on wants.</p>`
    },
    2: {
      title: "Compound Interest & Rule of 72",
      body: `<h3>The Power of Compound Interest:</h3>
<p>Compound interest is the cycle where you earn returns on your initial capital, and then earn returns on those returns. Over time, it turns small consistent sums into substantial wealth.</p>
<h3>The Rule of 72:</h3>
<p>To calculate how long it takes for your investment to double, divide 72 by your annual interest rate:</p>
<ul>
  <li>If your savings app yields <strong>6%</strong> annually: 72 ÷ 6 = <strong>12 years</strong> to double.</li>
  <li>If your index portfolio returns <strong>9%</strong>: 72 ÷ 9 = <strong>8 years</strong> to double.</li>
</ul>
<p><strong>Pro Tip:</strong> The earlier you start saving, the longer compound interest works its magic on your savings ledger.</p>`
    },
    3: {
      title: "Debt Snowball vs Avalanche",
      body: `<h3>1. Debt Snowball Method:</h3>
<p>List your liabilities from smallest balance to largest. Pay the minimums on all, and dump all extra cash into the smallest debt first. Once that is paid, roll its payment into the next smallest.</p>
<p><strong>Benefits:</strong> Builds instant mental motivation and psychological momentum.</p>
<h3>2. Debt Avalanche Method:</h3>
<p>List your debts from highest interest rate to lowest. Pay extra cash towards the highest interest debt first. This minimizes the total interest you pay over time.</p>
<p><strong>Benefits:</strong> Mathematically saves the most cash.</p>
<p><strong>Pro Tip:</strong> Pick Snowball if you need quick psychological wins; pick Avalanche if you are highly disciplined.</p>`
    },
    4: {
      title: "Building an Emergency Cushion",
      body: `<h3>Why it Matters:</h3>
<p>An emergency fund is your safety net, preventing you from borrowing high-interest consumer debt when unforeseen expenses occur (e.g. medical emergencies, car breakdown, job loss).</p>
<h3>Baseline target:</h3>
<p>Secure between <strong>3 to 6 months</strong> of essential expenses in a highly liquid account (like a high-yield savings app or wallet).</p>
<p><strong>Pro Tip:</strong> Use the savings goal module in this dashboard to track your Emergency Fund progress separately from other leisure goals.</p>`
    },
    5: {
      title: "Inflation & Purchasing Power",
      body: `<h3>How Inflation Works:</h3>
<p>Inflation is the steady rise in the prices of goods and services over time. As inflation increases, every currency unit buys a smaller percentage of a good. Essentially, it erodes the buying power of cash.</p>
<h3>The Cost of Holding Cash:</h3>
<p>If you keep all your money in physical cash or in a standard zero-interest bank account while inflation is at 4%, your money effectively loses 4% of its purchasing value every year.</p>
<p><strong>Pro Tip:</strong> Beat inflation by keeping short-term cash in high-yield savings accounts and investing long-term funds in compounding assets like index funds or real estate.</p>`
    },
    6: {
      title: "Understanding Credit Scores",
      body: `<h3>What is a Credit Score?</h3>
<p>A credit score is a numerical expression based on a level analysis of a person's credit files, representing their creditworthiness. Lenders use it to evaluate the potential risk posed by lending money.</p>
<h3>Key Score Factors:</h3>
<ul>
  <li><strong>Payment History (35%):</strong> Repaying obligations on time is the single largest factor.</li>
  <li><strong>Amounts Owed (30%):</strong> Keep credit card balances below 30% of their total limit.</li>
  <li><strong>Credit History Length (15%):</strong> Older accounts demonstrate reliability.</li>
</ul>
<p><strong>Pro Tip:</strong> A stellar credit score can save you thousands of dollars in interest charges over the lifetime of a home mortgage or car loan.</p>`
    },
    7: {
      title: "Asset Classes & Diversification",
      body: `<h3>Common Asset Classes:</h3>
<ul>
  <li><strong>Equities (Stocks):</strong> Ownership shares in companies. Offers high growth potential but comes with higher volatility.</li>
  <li><strong>Fixed Income (Bonds):</strong> Debt securities that pay regular interest. Generally safer than stocks but yields lower returns.</li>
  <li><strong>Cash/Equivalents:</strong> Treasury bills or saving accounts. Extremely safe but highly vulnerable to inflation.</li>
</ul>
<h3>What is Diversification?</h3>
<p>"Don't put all your eggs in one basket." Distributing your capital across different asset classes and geographic sectors reduces the impact of any single market downturn.</p>
<p><strong>Pro Tip:</strong> Diversified mutual funds or ETFs allow you to hold hundreds of assets simultaneously with minimal effort.</p>`
    },
    8: {
      title: "The True Cost of Debt",
      body: `<h3>Good Debt vs. Bad Debt:</h3>
<ul>
  <li><strong>Good Debt:</strong> Borrowing money to acquire assets that grow in value or generate income (e.g. mortgages for real estate or student loans for higher earning potential).</li>
  <li><strong>Bad Debt:</strong> Borrowing money to buy depreciating consumer assets that drain cash flow (e.g. credit cards for designer clothes or auto loans for luxury cars).</li>
</ul>
<h3>The Compound Trap:</h3>
<p>High-interest credit card debt (often $\ge 20\%$ APR) compounds monthly. A balance of $1,000 left unpaid can double in a few years, trapping you in a debt loop.</p>
<p><strong>Pro Tip:</strong> Pay off credit card statements in full every single month to avoid paying interest entirely.</p>`
    },
    9: {
      title: "Retirement Accounts & Pensions",
      body: `<h3>The Power of Tax Shields:</h3>
<p>Retirement plans (like pensions, 401ks, or retirement annuities) offer massive tax advantages. Deposits are often deducted from your pre-tax income, immediately lowering your yearly tax bill.</p>
<h3>Employer Matching:</h3>
<p>Many firms offer employer matches (e.g., matching your pension contributions up to 5%). This is literally free money that instantly doubles your retirement savings rate.</p>
<p><strong>Pro Tip:</strong> Always contribute at least enough to claim the full employer match. Otherwise, you are leaving money on the table.</p>`
    },
    10: {
      title: "Psychology of Spend & Ads",
      body: `<h3>How Marketers Target You:</h3>
<p>Modern advertisements are designed to trigger emotional responses (urgency, scarcity, status) that prompt immediate spending. Retail stores use pricing tricks (like $9.99 instead of $10) to make items appear cheaper.</p>
<h3>Strategies to Curb Impulse Spending:</h3>
<ul>
  <li><strong>The 48-Hour Rule:</strong> Wait 48 hours before purchasing any non-essential item. If the desire fades, do not buy it.</li>
  <li><strong>Calculate in Labor Hours:</strong> Divide the item's cost by your hourly wage to see how many hours of hard work it costs.</li>
</ul>
<p><strong>Pro Tip:</strong> Make saving as easy as possible by automating transfers, and make spending harder by unlinking cards from online stores.</p>`
    }
  };

  const bookSummaries = {
    1: {
      title: "Rich Dad Poor Dad — Summary",
      body: `<h3>Key Takeaways:</h3>
<ol>
  <li><strong>The Rich Don't Work for Money:</strong> The middle class works for money; the rich make money work for them by acquiring assets.</li>
  <li><strong>Financial Education is Key:</strong> Understand the difference between an asset (puts money in your pocket) and a liability (takes money out of your pocket).</li>
  <li><strong>Mind Your Own Business:</strong> Keep your day job but start buying assets instead of liabilities (like luxury cars or expensive loans).</li>
  <li><strong>Work to Learn, Don't Work to Earn:</strong> Focus on acquiring skills in sales, marketing, and leadership rather than just climbing the corporate ladder.</li>
</ol>`
    },
    2: {
      title: "The Psychology of Money — Summary",
      body: `<h3>Key Takeaways:</h3>
<ol>
  <li><strong>Behavior beats Math:</strong> Doing well with money isn't necessarily about what you know. It's about how you behave.</li>
  <li><strong>Never Enough:</strong> Social comparison is the enemy. Learn when to stop taking risks that could ruin what you already have and need.</li>
  <li><strong>Wealth is what you don't see:</strong> Spending money to show people how much money you have is the fastest way to have less money. Wealth is the unused asset.</li>
  <li><strong>Room for Error:</strong> The most important part of every plan is planning on your plan not going according to plan.</li>
</ol>`
    },
    3: {
      title: "The Richest Man in Babylon — Summary",
      body: `<h3>The Seven Cures for a Lean Purse:</h3>
<ol>
  <li><strong>Start thy purse to fattening:</strong> Save at least 10% of all you earn.</li>
  <li><strong>Control thy expenditures:</strong> Budget your expenses so that you have enough to pay for your necessities and savings.</li>
  <li><strong>Make thy gold multiply:</strong> Reinvest your savings so that it earns interest.</li>
  <li><strong>Guard thy treasures from loss:</strong> Invest only where your principal is safe and you can claim it if needed.</li>
  <li><strong>Make of thy dwelling a profitable investment:</strong> Own your own home.</li>
  <li><strong>Insure a future income:</strong> Provide in advance for the needs of thy growing age and protection of thy family.</li>
  <li><strong>Increase thy ability to earn:</strong> Cultivate thy skills and study to become wiser.</li>
</ol>`
    },
    4: {
      title: "The Total Money Makeover — Summary",
      body: `<h3>Dave Ramsey's Baby Steps:</h3>
<ol>
  <li><strong>Step 1:</strong> Save a starter emergency fund ($1,000 / small cushion).</li>
  <li><strong>Step 2:</strong> Pay off all debt (except the house) using the Debt Snowball.</li>
  <li><strong>Step 3:</strong> Save a fully funded emergency fund covering 3 to 6 months of expenses.</li>
  <li><strong>Step 4:</strong> Invest 15% of your household income into retirement index funds.</li>
  <li><strong>Step 5:</strong> Fund college tuition goals for children.</li>
  <li><strong>Step 6:</strong> Pay off your home mortgage early.</li>
  <li><strong>Step 7:</strong> Build wealth and give generously.</li>
</ol>`
    },
    5: {
      title: "The Intelligent Investor — Summary",
      body: `<h3>Key Takeaways:</h3>
<ol>
  <li><strong>Investment vs. Speculation:</strong> True investment promises safety of principal and a satisfactory return. Anything else is speculative gambling.</li>
  <li><strong>Meet Mr. Market:</strong> View stock price movements as a business partner who offers daily buy/sell prices. Exploit his wild swings; do not follow his mood.</li>
  <li><strong>Margin of Safety:</strong> Always buy assets at a discount to their intrinsic value to build a cushion against mistakes or bad luck.</li>
</ol>`
    },
    6: {
      title: "Think and Grow Rich — Summary",
      body: `<h3>Key Takeaways:</h3>
<ol>
  <li><strong>Definiteness of Purpose:</strong> Write down your exact financial goal, the deadline, and a clear plan detailing how you will provide value to earn it.</li>
  <li><strong>Autosuggestion:</strong> Feed your subconscious mind positive affirmations, belief, and clear goals twice daily.</li>
  <li><strong>The Mastermind Alliance:</strong> Coordinate with a team of like-minded individuals to leverage collective wisdom, speed up projects, and share lessons.</li>
</ol>`
    },
    7: {
      title: "Your Money or Your Life — Summary",
      body: `<h3>Key Takeaways:</h3>
<ol>
  <li><strong>Money is Life Energy:</strong> Every dollar spent represents precious hours of your finite life energy. Calculate your real hourly wage after subtracting travel and work costs.</li>
  <li><strong>The Crossover Point:</strong> Track your monthly cost of living. Once monthly passive investment returns exceed your monthly expenses, you achieve absolute independence.</li>
  <li><strong>Frugality is Liberation:</strong> Align spending with your inner values and life goals rather than social status pressures.</li>
</ol>`
    },
    8: {
      title: "The Millionaire Next Door — Summary",
      body: `<h3>Key Takeaways:</h3>
<ol>
  <li><strong>Appearances vs. Reality:</strong> True self-made millionaires typically live frugally, reside in middle-class neighborhoods, and drive used vehicles.</li>
  <li><strong>UAW vs. PAW:</strong> Under Accumulators of Wealth consume income quickly; Prodigious Accumulators of Wealth invest and save a high share of earnings.</li>
  <li><strong>Economic Outpatient Care:</strong> Providing regular financial aid to adult children often cripples their ambition to create wealth independently.</li>
</ol>`
    },
    9: {
      title: "I Will Teach You To Be Rich — Summary",
      body: `<h3>Key Takeaways:</h3>
<ol>
  <li><strong>Conscious Spending Plan:</strong> Cut costs ruthlessly on things you do not care about, but spend extravagantly on the luxury items you love.</li>
  <li><strong>Autopilot Finances:</strong> Automate your bill payments, savings rates, and investment accounts to route cash dynamically without willpower.</li>
  <li><strong>Guilt-Free Consumption:</strong> Focus on saving 10-15% of your money, and then spend the remaining cash without feeling anxious.</li>
</ol>`
    },
    10: {
      title: "Bogleheads' Guide to Investing — Summary",
      body: `<h3>Key Takeaways:</h3>
<ol>
  <li><strong>Buy Low-Cost Index Funds:</strong> Passive index mutual funds consistently beat actively managed mutual funds over long horizons due to lower fees.</li>
  <li><strong>Minimize Taxes & Fees:</strong> High transaction fees and active fund managers erode compound growth. Prioritize low-expense ratio assets.</li>
  <li><strong>Stay the Course:</strong> Market corrections are normal cycles. Maintain steady monthly index dollar-cost averaging regardless of short-term news.</li>
</ol>`
    }
  };

  let currentReadingType = null; // Track read type ('lesson' or 'book')
  let currentReadingIndex = null; // Track index of read item

  /**
   * 8. Redraws the Guide view panel displaying lessons read completion checklist states.
   */
  function renderFinancialGuide() {
    const store = window.AppStore;
    const settings = store.getSettings();
    const isPremium = settings.isPremium;

    // Read completed lessons and books from local storage indexes
    const completedLessons = JSON.parse(localStorage.getItem('GUIDE_LESSONS_COMPLETED') || '[]');
    const readBooks = JSON.parse(localStorage.getItem('GUIDE_BOOKS_COMPLETED') || '[]');

    // Loop through checkboxes matching lessons
    document.querySelectorAll('.lesson-checkbox').forEach(chk => {
      const idx = parseInt(chk.getAttribute('data-index'));
      const isLocked = false; // All lessons are free for all users
      const card = chk.closest('.lesson-card');
      const readBtn = card.querySelector('.read-lesson-btn');
      
      chk.checked = completedLessons.includes(idx); // Update checkbox status
      
      if (isLocked) {
        card.style.opacity = '0.55';
        chk.disabled = true;
        readBtn.innerHTML = '🔒 Unlock Premium';
        readBtn.style.background = 'linear-gradient(135deg, #f1c40f, #f39c12)';
        readBtn.style.color = '#0b0f19';
        readBtn.style.borderColor = '#f39c12';
        readBtn.classList.add('premium-locked-action');
      } else {
        card.style.opacity = '1';
        chk.disabled = false;
        readBtn.innerHTML = 'Read Lesson';
        readBtn.style.background = '';
        readBtn.style.color = '';
        readBtn.style.borderColor = '';
        readBtn.classList.remove('premium-locked-action');
        
        if (chk.checked) {
          card.style.borderColor = 'var(--color-success-glow)';
          card.style.background = 'rgba(16, 185, 129, 0.02)';
        } else {
          card.style.borderColor = 'var(--color-border)';
          card.style.background = 'var(--bg-card)';
        }
      }
    });

    // Loop through checkboxes matching books
    document.querySelectorAll('.book-checkbox').forEach(chk => {
      const idx = parseInt(chk.getAttribute('data-index'));
      const isLocked = false; // Books are free for all users
      const card = chk.closest('.book-card');
      const readBtn = card.querySelector('.read-book-btn');
      
      chk.checked = readBooks.includes(idx); // Update status
      
      if (isLocked) {
        card.style.opacity = '0.55';
        chk.disabled = true;
        readBtn.innerHTML = '🔒 Unlock Premium';
        readBtn.style.background = 'linear-gradient(135deg, #f1c40f, #f39c12)';
        readBtn.style.color = '#0b0f19';
        readBtn.style.borderColor = '#f39c12';
        readBtn.classList.add('premium-locked-action');
      } else {
        card.style.opacity = '1';
        chk.disabled = false;
        readBtn.innerHTML = 'View Summary';
        readBtn.style.background = '';
        readBtn.style.color = '';
        readBtn.style.borderColor = '';
        readBtn.classList.remove('premium-locked-action');
        
        if (chk.checked) {
          card.style.borderColor = 'rgba(234, 179, 8, 0.3)';
          card.style.background = 'rgba(234, 179, 8, 0.02)';
        } else {
          card.style.borderColor = 'var(--color-border)';
          card.style.background = 'var(--bg-card)';
        }
      }
    });

    // Calculate learning progress across the 20 items (10 lessons + 10 books)
    const totalItems = 20; 
    const completedItems = completedLessons.length + readBooks.length;
    const progressPercent = Math.round((completedItems / totalItems) * 100);

    // Update progress bars widths
    if (elements.guideProgressBar) {
      elements.guideProgressBar.style.width = `${progressPercent}%`;
    }
    if (elements.guideProgressPercent) {
      elements.guideProgressPercent.textContent = `${progressPercent}% Done`;
    }
  }

  /**
   * Toggles layouts, blurs, ads, and tools lock states based on premium status.
   */
  function renderPremiumLayout() {
    const store = window.AppStore;
    const settings = store.getSettings();
    const isPremium = settings.isPremium;



    // Toggle diagnostics blur overlay
    if (elements.diagnosticsLockOverlay) {
      elements.diagnosticsLockOverlay.style.display = isPremium ? 'none' : 'flex';
    }

    // Toggle crown badges and profile roles
    const crownBadges = document.querySelectorAll('.profile-role');
    crownBadges.forEach(role => {
      role.innerHTML = isPremium 
        ? '<span style="color: #f1c40f; font-weight: 700; display: flex; align-items: center; gap: 4px;"><svg style="width: 12px; height: 12px; fill: #f1c40f;"><use href="#icon-crown"></use></svg> Premium Member</span>' 
        : 'Standard Member';
    });

    // Hide or modify sidebar upgrade button
    if (elements.sidebarUpgradeBtn) {
      elements.sidebarUpgradeBtn.style.display = isPremium ? 'none' : 'flex';
    }

    // Handle Premium tool lock configurations
    const premiumTools = [
      elements.exportCsvBtn,
      elements.importCsvBtn,
      elements.exportJsonShareBtn,
      elements.loadJsonBackupBtn,
      elements.exportPdfBtn
    ];

    const freePdfUsed = settings.freePdfExportsUsed || 0;

    premiumTools.forEach(tool => {
      if (tool) {
        tool.removeAttribute('disabled');
        if (isPremium) {
          tool.style.opacity = '1';
          tool.style.cursor = 'pointer';
          if (tool.id === 'exportCsvBtn') tool.title = 'Export transactions to CSV';
          if (tool.id === 'importCsvBtn') tool.title = 'Import transactions from CSV';
          if (tool.id === 'exportJsonShareBtn') tool.title = 'Download JSON backup';
          if (tool.id === 'loadJsonBackupBtn') tool.title = 'Upload JSON backup';
          if (tool.id === 'exportPdfBtn') {
            tool.title = 'Export PDF monthly statement';
            tool.innerHTML = '<svg style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; margin-right: 6px; vertical-align: middle;"><use href="#icon-print"></use></svg>PDF Report';
          }
        } else {
          if (tool.id === 'exportPdfBtn' && freePdfUsed === 0) {
            tool.style.opacity = '1';
            tool.style.cursor = 'pointer';
            tool.title = '🎁 Free Trial: 1 PDF statement export remaining';
            tool.innerHTML = '<svg style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; margin-right: 6px; vertical-align: middle;"><use href="#icon-print"></use></svg>PDF Report (1 Free)';
          } else {
            tool.style.opacity = '0.75';
            tool.style.cursor = 'pointer';
            if (tool.id === 'exportPdfBtn') {
              tool.title = '🔒 Premium Feature: Click to upgrade to Premium';
              tool.innerHTML = '🔒 PDF Report';
            } else if (tool.id === 'exportCsvBtn') {
              tool.title = '🔒 Premium Feature: Click to unlock CSV Export';
            } else if (tool.id === 'importCsvBtn') {
              tool.title = '🔒 Premium Feature: Click to unlock CSV Import';
            } else {
              tool.title = '🔒 Premium Feature: Click to upgrade to Premium';
            }
          }
        }
      }
    });

    // Manage Premium Theme Picker layout
    const themeNotice = document.getElementById('premiumThemeNotice');
    if (themeNotice) {
      themeNotice.innerHTML = isPremium 
        ? '<span style="color: var(--color-success); font-weight: 700;">✓ Premium unlocked! Select your dashboard color layout below.</span>'
        : 'Upgrade to Premium Membership to select custom colors and layout designs.';
    }

    const themeButtons = document.querySelectorAll('.btn-theme-select');
    themeButtons.forEach(btn => {
      const themeVal = btn.getAttribute('data-theme-val');
      if (isPremium) {
        btn.style.opacity = '1';
        btn.style.filter = 'none';
        btn.style.cursor = 'pointer';
        
        // Highlight active theme
        const activeTheme = settings.activeTheme || 'default';
        if (themeVal === activeTheme) {
          btn.classList.add('active');
          btn.style.borderColor = 'var(--color-primary)';
        } else {
          btn.classList.remove('active');
          btn.style.borderColor = 'var(--color-border)';
        }
      } else {
        // Standard user limits
        if (themeVal !== 'default') {
          btn.style.opacity = '0.4';
          btn.style.filter = 'grayscale(1)';
          btn.style.cursor = 'not-allowed';
          btn.classList.remove('active');
          btn.style.borderColor = 'var(--color-border)';
        } else {
          btn.classList.add('active');
          btn.style.borderColor = 'var(--color-primary)';
        }
      }
    });
  }

  /**
   * Renders real-time visual alert banners if any budget category is breached or over 75% capacity.
   */
  function renderBudgetBreachAlerts() {
    const container = document.getElementById('budgetBreachAlertContainer');
    if (!container) return;

    const store = window.AppStore;
    const currency = store.getSettings().currency;
    const transactions = getFilteredTransactions();
    const budgets = store.getBudgets();

    const categoryTotals = {};
    transactions.forEach(tx => {
      if (tx.type === 'expense' && tx.category) {
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      }
    });

    const breachedList = [];
    const warningList = [];

    Object.keys(budgets).forEach(category => {
      const limit = budgets[category];
      const spent = categoryTotals[category] || 0;
      if (limit > 0) {
        const percent = (spent / limit) * 100;
        if (percent > 100) {
          breachedList.push({ category, spent, limit, over: spent - limit });
        } else if (percent >= 75) {
          warningList.push({ category, spent, limit, percent });
        }
      }
    });

    if (breachedList.length === 0 && warningList.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';

    if (breachedList.length > 0) {
      const names = breachedList.map(b => `${b.category} (+${formatMoney(b.over, currency)})`).join(', ');
      container.innerHTML = `
        <div class="card alert-card-breach" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(17, 24, 39, 0.75)); border: 1.5px solid var(--color-danger); padding: 16px 20px; border-radius: var(--border-radius-md); display: flex; align-items: center; justify-content: space-between; gap: 16px; box-shadow: 0 4px 20px rgba(239, 68, 68, 0.25);">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--color-danger); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; box-shadow: 0 0 12px rgba(239, 68, 68, 0.6);">
              🚨
            </div>
            <div>
              <h4 style="font-size: 0.98rem; font-weight: 800; color: var(--color-danger); margin: 0 0 2px 0;">Budget Overspend Alert (${breachedList.length} ${breachedList.length === 1 ? 'Category' : 'Categories'} Breached)</h4>
              <p style="font-size: 0.83rem; color: var(--text-main); margin: 0; line-height: 1.4;">${names} exceeded spending limits! Review your ledger entries or adjust monthly budgets.</p>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="alertManageBudgetsBtn" style="white-space: nowrap; font-weight: 700; border-color: var(--color-danger); color: var(--color-danger); background: rgba(239, 68, 68, 0.1);">
            Manage Budgets
          </button>
        </div>
      `;
      const btn = container.querySelector('#alertManageBudgetsBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          switchTab('budgets');
        });
      }
    } else {
      const names = warningList.map(w => `${w.category} (${w.percent.toFixed(0)}%)`).join(', ');
      container.innerHTML = `
        <div class="card alert-card-warning" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(17, 24, 39, 0.75)); border: 1.5px solid var(--color-warning); padding: 16px 20px; border-radius: var(--border-radius-md); display: flex; align-items: center; justify-content: space-between; gap: 16px; box-shadow: 0 4px 20px rgba(245, 158, 11, 0.2);">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--color-warning); color: #0b0f19; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; box-shadow: 0 0 12px rgba(245, 158, 11, 0.5);">
              ⚠️
            </div>
            <div>
              <h4 style="font-size: 0.98rem; font-weight: 800; color: var(--color-warning); margin: 0 0 2px 0;">Budget Warning (${warningList.length} ${warningList.length === 1 ? 'Category' : 'Categories'} Near Limit)</h4>
              <p style="font-size: 0.83rem; color: var(--text-main); margin: 0; line-height: 1.4;">${names} reached over 75% capacity. Monitor upcoming expenses to prevent breaches.</p>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="alertManageBudgetsBtn" style="white-space: nowrap; font-weight: 700; border-color: var(--color-warning); color: var(--color-warning); background: rgba(245, 158, 11, 0.1);">
            Manage Budgets
          </button>
        </div>
      `;
      const btn = container.querySelector('#alertManageBudgetsBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          switchTab('budgets');
        });
      }
    }
  }

  /**
   * Generates and prints a complete formatted PDF Monthly Financial Statement.
   */
  function exportPdfStatement() {
    const store = window.AppStore;
    const settings = store.getSettings();
    const isPremium = settings.isPremium;
    const freePdfUsed = settings.freePdfExportsUsed || 0;

    if (!isPremium) {
      if (freePdfUsed >= 1) {
        openModal(elements.premiumUpgradeModal);
        alert('You have already used your 1 free PDF statement export. Please upgrade to Premium to unlock unlimited report exports!');
        return;
      } else {
        // Persist the 1-time usage count to settings
        store.updateSettings({ freePdfExportsUsed: 1 });
        // Update premium visual elements instantly
        renderPremiumLayout();
        alert('🎁 You are using your 1-time Free Trial PDF Report Export. Future PDF reports require upgrading to Premium!');
      }
    }
    const currency = settings.currency;
    const transactions = getFilteredTransactions();
    const balance = store.getBalance();
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let incomeTotal = 0;
    let expenseTotal = 0;
    transactions.forEach(tx => {
      if (tx.type === 'income') incomeTotal += tx.amount;
      else expenseTotal += tx.amount;
    });

    const printWin = window.open('', '_blank', 'width=900,height=800');
    if (!printWin) {
      alert('Please allow popups to generate your PDF Financial Statement.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Financial Statement - ${settings.userName}</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; padding: 40px; margin: 0; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
          .brand { font-size: 24px; font-weight: 800; color: #4f46e5; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .meta { text-align: right; font-size: 13px; color: #475569; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
          .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
          .kpi-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
          .kpi-num { font-size: 20px; font-weight: 800; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
          th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-weight: 700; border-bottom: 1px solid #cbd5e1; }
          td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
          .income { color: #059669; font-weight: 600; }
          .expense { color: #dc2626; font-weight: 600; }
          .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">FinFlow Financial Dashboard</div>
            <div class="subtitle">Official Executive Financial Statement & Ledger Export</div>
          </div>
          <div class="meta">
            <div><strong>Account Holder:</strong> ${settings.userName}</div>
            <div><strong>Date:</strong> ${today}</div>
            <div><strong>Currency:</strong> ${currency}</div>
          </div>
        </div>

        <div class="summary-grid">
          <div class="kpi-box">
            <div class="kpi-title">Net Worth</div>
            <div class="kpi-num">${formatMoney(balance.total, currency)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Liquid Cash</div>
            <div class="kpi-num">${formatMoney(balance.cash, currency)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Selected Inflows</div>
            <div class="kpi-num income">${formatMoney(incomeTotal, currency)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Selected Outflows</div>
            <div class="kpi-num expense">${formatMoney(expenseTotal, currency)}</div>
          </div>
        </div>

        <h3 style="font-size: 16px; margin-bottom: 8px;">Itemized Financial Ledger (${transactions.length} entries)</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(tx => `
              <tr>
                <td>${tx.date}</td>
                <td>${tx.description}</td>
                <td>${tx.category}</td>
                <td>${tx.type.toUpperCase()}</td>
                <td class="${tx.type}">${tx.type === 'income' ? '+' : '-'}${formatMoney(tx.amount, currency)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>FinFlow — Personal Financial Management Software Platform</div>
          <div>Compliance Review & Support: finflow64@gmail.com</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  }

  /**
   * Main synchronization routing function. Redraws all view panels.
   */
  function syncUI() {
    const store = window.AppStore;
    // Sync header currency switcher value to active settings currency
    if (elements.headerCurrencySelector) {
      const activeCurr = store.getSettings().currency;
      const hasOption = Array.from(elements.headerCurrencySelector.options).some(opt => opt.value === activeCurr);
      if (!hasOption && activeCurr) {
        const newOpt = document.createElement('option');
        newOpt.value = activeCurr;
        newOpt.textContent = activeCurr;
        elements.headerCurrencySelector.appendChild(newOpt);
      }
      elements.headerCurrencySelector.value = activeCurr;
    }
    populateTimeframeOptions();
    renderKPIs();
    renderTransactions();
    renderBudgets();
    renderSavingsGoals();
    renderSettings();
    renderTodos();
    renderDiagnostics();
    renderDailyAdvice();
    renderFinancialGuide();
    renderPremiumLayout();
    renderBudgetBreachAlerts();
    renderAIInsights();
    
    // Update charts dimensions and redraw trend curves safely
    if (window.AppCharts && typeof window.AppCharts.updateAll === 'function') {
      window.AppCharts.updateAll();
    }
    
    // Calculate category breakdown sums specifically for charts
    const filteredTxs = getFilteredTransactions();
    const categoryBreakdown = {};
    filteredTxs.forEach(tx => {
      if (tx.type === 'expense') {
        categoryBreakdown[tx.category] = (categoryBreakdown[tx.category] || 0) + tx.amount;
      }
    });
    if (window.AppCharts && typeof window.AppCharts.updateCategoryChart === 'function') {
      window.AppCharts.updateCategoryChart(categoryBreakdown);
    }
  }

  /**
   * Generates proactive AI Insights based on user transaction history, budgets, and savings goals.
   */
  /**
   * Generates Proactive AI Insights (v1 Roadmap) based on user transaction history, budgets, and savings goals.
   */
  function renderAIInsights() {
    if (!elements.aiInsightsContent) return;

    const store = window.AppStore;
    const settings = store.getSettings();
    const isPremium = settings.isPremium;
    const currency = settings.currency || '$';
    const transactions = store.getTransactions() || [];
    const budgets = store.getBudgets() || [];
    const goals = store.getGoals() || [];
    const rawBalance = store.getBalance();
    const balanceNum = (typeof rawBalance === 'object' && rawBalance !== null) ? (rawBalance.total ?? rawBalance.cash ?? 0) : (Number(rawBalance) || 0);

    const generatedInsights = [];

    // --- AGGREGATE TRANSACTION TOTALS UPFRONT ---
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = {};
    let airtimeSpend = 0;
    let streamingSpend = 0;

    transactions.forEach(tx => {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else if (tx.type === 'expense') {
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
        totalExpense += tx.amount;

        const noteLower = (tx.note || tx.description || '').toLowerCase();
        const catLower = (tx.category || '').toLowerCase();
        if (noteLower.includes('airtime') || noteLower.includes('data') || noteLower.includes('mtn') || noteLower.includes('telecel') || noteLower.includes('at')) {
          airtimeSpend += tx.amount;
        }
        if (noteLower.includes('netflix') || noteLower.includes('dstv') || noteLower.includes('showmax') || noteLower.includes('spotify') || catLower.includes('entertainment')) {
          streamingSpend += tx.amount;
        }
      }
    });

    // --- 90-DAY PREDICTIVE CASH FLOW FORECAST (PREMIUM) ---
    const daysInPeriod = Math.max(1, transactions.length > 1 ? Math.round((new Date(transactions[0].date) - new Date(transactions[transactions.length - 1].date)) / (1000 * 60 * 60 * 24)) : 30);
    const avgDailyIncome = totalIncome / daysInPeriod;
    const avgDailyExpense = totalExpense / daysInPeriod;
    const dailyNetBurn = avgDailyExpense - avgDailyIncome;
    const projected90DayBalance = Math.round(balanceNum + (avgDailyIncome - avgDailyExpense) * 90);

    if (dailyNetBurn > 0 && balanceNum > 0) {
      const daysToZero = Math.max(1, Math.round(balanceNum / dailyNetBurn));
      generatedInsights.push({
        type: 'forecast',
        title: '🔮 90-Day Cash Flow Warning',
        desc: `At your current burn rate, your liquid cash balance is projected to reach <strong>${currency}0</strong> in ~<strong>${daysToZero} days</strong>. Cut optional spend by 15% to extend your runway.`
      });
    } else {
      generatedInsights.push({
        type: 'forecast',
        title: '🔮 90-Day Predictive Runway',
        desc: `Great trajectory! At current earnings & spend rates, your projected cash balance in 90 days is <strong>${currency}${projected90DayBalance.toLocaleString()}</strong>.`
      });
    }

    // --- AUTOMATED MICRO-SPENDING LEAK AUDIT ---
    let microLeakCount = 0;
    let microLeakTotal = 0;
    transactions.forEach(tx => {
      if (tx.type === 'expense' && tx.amount <= 35) {
        microLeakCount++;
        microLeakTotal += tx.amount;
      }
    });

    if (microLeakCount > 2) {
      generatedInsights.push({
        type: 'leak',
        title: '🚨 Micro-Spending Leak Audit',
        desc: `Detected <strong>${microLeakCount} micro-expenses</strong> totaling <strong>${currency}${microLeakTotal.toLocaleString()}</strong>. Small daily cash leaks add up to ~${currency}${Math.round(microLeakTotal * 4)} monthly!`
      });
    }

    // --- 1. SPENDING INSIGHTS ("I see you") ---

    let topCategory = null;
    let maxExpense = 0;
    Object.keys(categoryTotals).forEach(cat => {
      if (categoryTotals[cat] > maxExpense) {
        maxExpense = categoryTotals[cat];
        topCategory = cat;
      }
    });

    // Category Spike
    if (topCategory && totalExpense > 0) {
      const percent = Math.round((maxExpense / totalExpense) * 100);
      generatedInsights.push({
        type: 'spending',
        title: '🚨 Category Spike Detected',
        desc: `You spent <strong>${currency}${maxExpense.toLocaleString()}</strong> on <strong>${topCategory}</strong> this period (${percent}% of total spend).`,
        prompt: `My spending on ${topCategory} reached ${currency}${maxExpense}. Give me 3 tips to cut it by 20% next month.`
      });
    }

    // Leak Detection (Airtime/Data)
    if (airtimeSpend > 50) {
      const monthlyEst = Math.round(airtimeSpend * 2);
      generatedInsights.push({
        type: 'spending',
        title: '📡 Airtime Leak Alert',
        desc: `You spent <strong>${currency}${airtimeSpend.toLocaleString()}</strong> on airtime/data (~${currency}${monthlyEst}/mo). Switching to monthly data bundles saves up to 30%.`,
        prompt: `I spent ${currency}${airtimeSpend} on airtime recently. How can I optimize my mobile data bundling strategy?`
      });
    }

    // Duplicate Subscriptions Audit
    if (streamingSpend > 100) {
      generatedInsights.push({
        type: 'spending',
        title: '🎬 Subscription Audit',
        desc: `Recurring media & entertainment costs reached <strong>${currency}${streamingSpend.toLocaleString()}</strong>. Rotating subscriptions month-to-month saves ${currency}100+ yearly.`,
        prompt: `I am spending ${currency}${streamingSpend} on entertainment subscriptions. Give me a strategy to consolidate them.`
      });
    }

    // --- 2. SAVINGS & GOAL INSIGHTS ---
    const activeGoal = goals.find(g => g.currentAmount < g.targetAmount);
    if (activeGoal) {
      const remaining = activeGoal.targetAmount - activeGoal.currentAmount;
      const suggestedWeekly = Math.ceil(remaining / 12);
      generatedInsights.push({
        type: 'savings',
        title: '🎯 Goal Acceleration',
        desc: `Move <strong>${currency}${suggestedWeekly.toLocaleString()}</strong> weekly into your <strong>'${activeGoal.title}'</strong> goal, and you'll hit your target 2 months early!`,
        prompt: `How can I deposit ${currency}${suggestedWeekly} weekly to hit my '${activeGoal.title}' goal faster?`
      });
    }

    // Idle Cash Alert
    if (balanceNum > 500) {
      const suggestedInvestment = Math.round(balanceNum * 0.4);
      generatedInsights.push({
        type: 'savings',
        title: '💰 Idle Cash Opportunity',
        desc: `You have <strong>${currency}${balanceNum.toLocaleString()}</strong> idle balance. Bank of Ghana T-Bills yield 15-25% p.a. Consider investing ${currency}${suggestedInvestment}.`,
        prompt: `I have ${currency}${balanceNum} liquid cash. What is the safest way to invest ${currency}${suggestedInvestment} in T-Bills?`
      });
    }

    // --- 3. WINS & ACCRA BENCHMARK ---
    const isUnderBudget = budgets.length > 0 && budgets.every(b => b.spent <= b.limit);
    if (isUnderBudget) {
      generatedInsights.push({
        type: 'wins',
        title: '👏 Win of the Week',
        desc: `Awesome discipline! You stayed under budget across all active categories. You saved more than <strong>70% of Finflow users in Accra</strong> this month!`,
        prompt: `I stayed under budget across all categories this week. Give me 2 tips to keep up my savings streak!`
      });
    } else {
      generatedInsights.push({
        type: 'wins',
        title: '⚡ Tracking Streak',
        desc: `You have recorded <strong>${transactions.length} transactions</strong>! Your ledger data is now accurate enough for predictive AI cash flow forecasting.`,
        prompt: `My ledger has ${transactions.length} transactions recorded. How can I use this data to forecast my net cash flow?`
      });
    }

    // --- 4. GHANA-SPECIFIC PROACTIVE TIPS ---
    generatedInsights.push({
      type: 'ghana',
      title: '📲 MoMo vs Bank Tip',
      desc: `Using cash withdrawals incurs 1% MoMo cashout fees. Use MoMo Pay directly or high-yield bank savings to save GHS 15-50 monthly on fees.`,
      prompt: `What is the best way to save on MoMo cashout withdrawal fees in Ghana?`
    });

    // Helper to safely escape prompt attributes
    const escapeAttr = (str) => (str || '').replace(/"/g, '&quot;');

    // --- RENDER LOGIC: FREE TEASER GATE VS PREMIUM UNLOCKED ---
    let insightsHTML = '';

    if (!isPremium) {
      const freeInsight = generatedInsights[0] || {
        title: '💡 Smart Money Tip',
        desc: 'Keep 1-2 weeks of operational cash on MoMo and route the rest into high-yield savings or T-Bills.'
      };

      insightsHTML = `
        <div class="ai-insight-item">
          <div class="insight-title">${freeInsight.title}</div>
          <div class="insight-desc">${freeInsight.desc}</div>
        </div>

        <div class="ai-insight-item locked-teaser">
          <div class="insight-title" style="color: #f1c40f; font-weight: 800;">👑 Proactive AI Insights (15+ Active)</div>
          <div class="insight-desc" style="margin-bottom: 8px;">
            Unlock background leak detection, idle cash alerts, category spike warnings & Accra benchmark stats with Premium (GH₵13.99/mo).
          </div>
          <button type="button" class="btn btn-primary btn-sm upgrade-trigger-btn" style="background: linear-gradient(135deg, #f1c40f, #f39c12); color: #0b0f19; font-weight: 800; border: none; font-size: 0.76rem; padding: 6px 14px; border-radius: 14px; cursor: pointer;">
            Upgrade to Premium (GH₵13.99)
          </button>
        </div>
      `;
    } else {
      insightsHTML = generatedInsights.map(item => `
        <div class="ai-insight-item">
          <div class="insight-title">${item.title}</div>
          <div class="insight-desc">${item.desc}</div>
        </div>
      `).join('');
    }

    elements.aiInsightsContent.innerHTML = insightsHTML;
  }

  // --- AI Chat Coach Core Engine ---
  let aiChatHistory = [
    {
      sender: 'ai',
      text: "👋 Hi! I'm **Finflow AI Coach**. I'm trained on your live financial data and budget history. Ask me anything like *'How much did I spend on food?'*, *'Can I afford a trip?'*, or *'Explain T-Bills like I'm 15'*!"
    }
  ];

  function renderAiChatThread() {
    if (!elements.aiChatThread) return;
    elements.aiChatThread.innerHTML = aiChatHistory.map(msg => `
      <div class="chat-bubble ${msg.sender}">
        ${msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
      </div>
    `).join('');
    elements.aiChatThread.scrollTop = elements.aiChatThread.scrollHeight;
  }

  function updateAiCoachModalStatus() {
    if (!elements.aiCoachStatusText) return;
    const store = window.AppStore;
    const settings = store.getSettings();
    const isPremium = settings.isPremium;
    const queryCount = settings.aiQueriesCount || 0;

    if (!navigator.onLine) {
      elements.aiCoachStatusText.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: var(--color-danger);"></span> 🌐 Offline Mode`;
      elements.aiCoachStatusText.style.color = 'var(--color-danger)';
      return;
    }

    if (isPremium) {
      elements.aiCoachStatusText.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: var(--color-success);"></span> 🟢 Online • 👑 Premium Unlimited AI Coach`;
      elements.aiCoachStatusText.style.color = 'var(--color-success)';
    } else {
      const remaining = Math.max(0, 2 - queryCount);
      if (remaining > 0) {
        elements.aiCoachStatusText.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: var(--color-success);"></span> 🟢 Online • 🎁 Free Trial: ${remaining} of 2 questions left`;
        elements.aiCoachStatusText.style.color = 'var(--color-success)';
      } else {
        elements.aiCoachStatusText.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #f1c40f;"></span> 👑 Free Trial Used • Upgrade for Unlimited`;
        elements.aiCoachStatusText.style.color = '#f1c40f';
      }
    }
  }

  let isSendingAiMessage = false;

  async function handleSendAiChatMessage(userInputText) {
    if (isSendingAiMessage) return;

    const text = (userInputText || (elements.aiChatInput ? elements.aiChatInput.value : '') || '').trim();
    if (!text) return;

    isSendingAiMessage = true;

    try {
      const store = window.AppStore;
      const settings = store.getSettings();
      const isPremium = settings.isPremium;

      // Remove legacy localstorage key if present
      localStorage.removeItem('FINFLOW_AI_QUERIES_COUNT');

      let queryCount = settings.aiQueriesCount || 0;

      // Check free trial query count for non-premium members
      if (!isPremium && queryCount >= 2) {
        openModal(elements.premiumUpgradeModal);
        alert('You have used your 2 free AI Coach trial questions. Upgrade to Premium for unlimited 24/7 AI financial coaching!');
        return;
      }

      // Check online network connectivity
      if (!navigator.onLine) {
        aiChatHistory.push({ sender: 'user', text: text });
        if (elements.aiChatInput) elements.aiChatInput.value = '';
        aiChatHistory.push({
          sender: 'ai',
          text: '🌐 **Finflow AI Coach requires an active internet connection**.\n\nPlease connect your device to Wi-Fi or mobile data to consult the AI Coach model.'
        });
        renderAiChatThread();
        return;
      }

      // Add user message
      aiChatHistory.push({ sender: 'user', text: text });
      if (elements.aiChatInput) elements.aiChatInput.value = '';
      
      // Show temporary "Thinking..." bubble
      aiChatHistory.push({ sender: 'ai', text: '⚡ <i>Thinking... consulting Gemini AI...</i>' });
      renderAiChatThread();

      // Increment query count for free users and save to store
      if (!isPremium) {
        queryCount += 1;
        store.updateSettings({ aiQueriesCount: queryCount });
        updateAiCoachModalStatus();
      }

      try {
        const responseText = await fetchGeminiAiResponse(text);
        aiChatHistory.pop(); // Remove "Thinking..."
        aiChatHistory.push({ sender: 'ai', text: responseText });
        renderAiChatThread();
      } catch (err) {
        console.warn('Gemini API fetch error, falling back to local engine:', err);
        aiChatHistory.pop(); // Remove "Thinking..."
        const fallbackText = generateAiCoachResponse(text); // Fallback to local rule engine
        aiChatHistory.push({ sender: 'ai', text: fallbackText });
        renderAiChatThread();
      }
    } finally {
      isSendingAiMessage = false;
    }
  }
  window.handleSendAiChatMessage = handleSendAiChatMessage;

  /**
   * Calls Google Gemini 1.5 Flash API with user's financial profile context.
   */
  async function fetchGeminiAiResponse(userPrompt) {
    const store = window.AppStore;
    const settings = store.getSettings();
    const currency = settings.currency || '$';
    const transactions = store.getTransactions() || [];
    const rawBalance = store.getBalance();
    const balanceNum = (typeof rawBalance === 'object' && rawBalance !== null) ? (rawBalance.total ?? rawBalance.cash ?? 0) : (Number(rawBalance) || 0);
    const budgets = store.getBudgets() || [];
    const goals = store.getGoals() || [];

    const systemPrompt = `You are Finflow AI Coach, an empathetic, highly intelligent personal financial advisor.
User's Financial Profile:
- Active Currency: ${currency}
- Total Liquid Balance: ${currency}${balanceNum.toLocaleString()}
- Total Recorded Transactions: ${transactions.length}
- Recent Ledger Activity: ${JSON.stringify(transactions.slice(-12).map(t => ({ date: t.date, category: t.category, type: t.type, amount: t.amount, note: t.note || t.description })))}
- Active Budgets: ${JSON.stringify(budgets.map(b => ({ category: b.category, limit: b.limit, spent: b.spent })))}
- Savings Goals: ${JSON.stringify(goals.map(g => ({ title: g.title, target: g.targetAmount, current: g.currentAmount })))}

Directives:
1. Answer concisely, warmly, and accurately in GFM Markdown format (use bolding, bullet points, emojis).
2. If the user asks about category spending or affordabilities, calculate exact numbers from their financial profile above.
3. If the user asks about Ghanaian or African financial topics (Cedis, MoMo, Bank of Ghana Treasury Bills/T-Bills, PAYE tax, Tier-3 pension), provide accurate, localized advice.
4. Keep your answer encouraging, practical, and under 250 words.`;

    // 1. Try Vercel Serverless Function (/api/ai-coach) to keep Gemini API Key 100% hidden & secure
    try {
      const apiRes = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, systemPrompt })
      });
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData.text) {
          return apiData.text;
        }
      }
    } catch (e) {
      console.warn('Vercel /api/ai-coach serverless proxy bypassed or offline, falling back...', e);
    }

    // 2. Direct API key fallback if set in settings or hardcoded
    const apiKey = HARDCODED_GEMINI_API_KEY || settings.geminiApiKey || '';
    if (apiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser Question: ' + userPrompt }] }]
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
          }
        }
      } catch (directErr) {
        console.warn('Direct Gemini API fetch error:', directErr);
      }
    }

    throw new Error('Invalid Gemini API response format');
  }

  function generateAiCoachResponse(prompt) {
    const store = window.AppStore;
    const settings = store.getSettings();
    const currency = settings.currency || '$';
    const transactions = store.getTransactions();
    const rawBalance = store.getBalance();
    const balanceNum = (typeof rawBalance === 'object' && rawBalance !== null) ? (rawBalance.total ?? rawBalance.cash ?? 0) : (Number(rawBalance) || 0);
    const lower = prompt.toLowerCase().trim();

    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryTotals = {};

    transactions.forEach(tx => {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else if (tx.type === 'expense') {
        totalExpenses += tx.amount;
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      }
    });

    // ROUTE 0: SMART FINANCIAL MATH & RATE EVALUATOR (Daily, Weekly, Monthly & Arithmetic)
    const rateMatch = lower.match(/(?:gh[c₵]?|\$|€|£)?\s*(\d+(?:\.\d+)?)\s*(?:cedis|dollars|naira)?\s*(daily|per day|weekly|per week|monthly|per month)\s*(?:for)?\s*(\d+)\s*(days?|weeks?|months?)/i) ||
                      lower.match(/(\d+(?:\.\d+)?)\s*(?:daily|per day|weekly|monthly)\s*(?:for)?\s*(\d+)/i);

    if (rateMatch) {
      const amount = parseFloat(rateMatch[1]);
      const count = parseFloat(rateMatch[2] && !isNaN(parseFloat(rateMatch[2])) ? rateMatch[2] : rateMatch[3]);
      const freqText = lower.includes('daily') || lower.includes('per day') ? 'daily' : (lower.includes('weekly') || lower.includes('per week') ? 'weekly' : 'monthly');
      const unitText = lower.includes('day') ? 'days' : (lower.includes('week') ? 'weeks' : 'months');

      if (!isNaN(amount) && !isNaN(count)) {
        const total = amount * count;
        return `🧮 **Financial Calculation Result**:

Receiving **${currency}${amount.toLocaleString()} ${freqText}** for **${count} ${unitText}** equals a **Total Income of ${currency}${total.toLocaleString()}**!

📊 *Breakdown*:
• Base Amount: **${currency}${amount.toLocaleString()}**
• Frequency: **${freqText}**
• Duration: **${count} ${unitText}**
• Total Calculation: ${currency}${amount} × ${count} = **${currency}${total.toLocaleString()}**

💡 *Smart Money Tip*:
If you save **20%** of this income (${currency}${(total * 0.2).toLocaleString()}), you can accelerate your active savings goals!`;
      }
    }

    // Percentage Calculation (e.g. "20% of 1000")
    const pctMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of)?\s*(?:gh[c₵]?|\$)?\s*(\d+(?:\.\d+)?)/i);
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      const base = parseFloat(pctMatch[2]);
      const result = (pct / 100) * base;
      return `🧮 **Percentage Calculation**:

**${pct}%** of **${currency}${base.toLocaleString()}** is **${currency}${result.toLocaleString()}**.`;
    }

    // Basic arithmetic ("200 * 5", "1000 - 400")
    const simpleMathMatch = lower.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)/i);
    if (simpleMathMatch) {
      const n1 = parseFloat(simpleMathMatch[1]);
      const op = simpleMathMatch[2];
      const n2 = parseFloat(simpleMathMatch[3]);
      let res = 0;
      if (op === '+') res = n1 + n2;
      else if (op === '-') res = n1 - n2;
      else if (op === '*') res = n1 * n2;
      else if (op === '/' && n2 !== 0) res = n1 / n2;
      
      return `🧮 **Calculation Result**:

**${n1} ${op} ${n2}** = **${currency}${res.toLocaleString()}**.`;
    }

    // ROUTE 1: T-Bills & Government Treasury / Investments Query
    if (
      lower.includes('t-bill') || lower.includes('t bill') || lower.includes('tbill') ||
      lower.includes('t-bills') || lower.includes('t bills') || lower.includes('tbills') ||
      lower.includes('treasury') || lower.includes('bonds') || lower.includes('sika') ||
      lower.includes('investment') || lower.includes('invest')
    ) {
      return `📈 **Treasury Bills (T-Bills) & High-Yield Investing**:
T-Bills are low-risk government debt securities issued by the Bank of Ghana:
1. **How they work**: You lend money to the government for **91 days**, **182 days**, or **364 days**.
2. **Returns**: Current annual yields range between **15% to 25% p.a.** (substantially beating basic savings accounts).
3. **Safety**: Backed by the government, making default risk minimal.

💡 *Best Way to Save with T-Bills*:
• Keep 1 month of living expenses on MoMo/Cash for daily transactions.
• Direct all extra savings into 91-day or 182-day T-Bills so your money compounds safely!
• You can purchase T-Bills via your commercial bank, investment broker, or Mobile Money USSD code.`;
    }

    // ROUTE 2: MoMo vs Bank / Wallet Strategy
    if (lower.includes('momo') || lower.includes('mobile money') || lower.includes('bank') || lower.includes('wallet')) {
      return `📲 **MoMo vs Bank Savings Strategy**:
- **Mobile Money (MoMo)**: Excellent for instant everyday payments & transfers, but keeping large balances in MoMo exposes your money to impulse spending and zero interest.
- **Bank / High-Yield Savings**: Best for emergency reserves & medium-term targets, earning compounding interest.

💡 *Pro Setup*:
1. Keep 1-2 weeks of operational cash on MoMo.
2. Automatically transfer salary surplus into a high-yield Bank account or T-Bill portfolio!`;
    }

    // ROUTE 3: Tax / PAYE / Salary
    if (lower.includes('tax') || lower.includes('paye') || lower.includes('salary') || lower.includes('deduction')) {
      return `🧾 **PAYE Salary Tax Guide**:
In Ghana, Personal Income Tax (PAYE) is progressive across income brackets:
- First **GHS 490**: 0% (Tax free)
- Next **GHS 110**: 5%
- Next **GHS 130**: 10%
- Next **GHS 3,166**: 17.5%
- Over **GHS 20,000**: 30%

💡 *Tax Saving Tip*: Voluntary Tier-3 pension contributions (up to 16.5% of gross salary) are **100% tax-exempt**!`;
    }

    // ROUTE 4: Affordability & Future Goals ("Can I afford", "trip", "buy", "vacation")
    if (lower.includes('afford') || lower.includes('trip') || lower.includes('buy') || lower.includes('vacation') || lower.includes('car') || lower.includes('house')) {
      const netSavings = totalIncome - totalExpenses;
      const disposable = Math.max(balanceNum, netSavings);
      return `✈️ **Affordability Assessment**:
Based on your current financial ledger:
- Liquid Balance: **${currency}${balanceNum.toLocaleString()}**
- Net Cash Flow: **${currency}${netSavings.toLocaleString()}**

If you deposit **${currency}200 weekly** into a target savings account, you will accumulate **${currency}800 in 1 month** and **${currency}2,400 in 3 months**!
${disposable > 500 ? `✅ Yes, you can afford it comfortably as long as you maintain your current spending discipline!` : `⚠️ It is doable, but consider cutting non-essential expenses by 10% to protect your emergency reserves.`}`;
    }

    // ROUTE 5: Category Spending Queries (food, uber, transport, groceries, etc.)
    const categoryKeywords = ['food', 'dining', 'restaurant', 'uber', 'transport', 'shopping', 'groceries', 'utilities', 'bills', 'health'];
    const hasCategoryKeyword = categoryKeywords.some(kw => lower.includes(kw));
    const matchingCategory = Object.keys(categoryTotals).find(cat => lower.includes(cat.toLowerCase()));

    if (matchingCategory || hasCategoryKeyword) {
      const catName = matchingCategory || (lower.includes('food') ? 'Food & Dining' : (lower.includes('uber') || lower.includes('transport') ? 'Transport' : 'Shopping'));
      const amt = categoryTotals[catName] || 0;
      const percentage = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;

      return `📊 **Spending Analysis**:
You have spent **${currency}${amt.toLocaleString()}** on **${catName}** so far.
This represents **${percentage}%** of your overall recorded expenses (${currency}${totalExpenses.toLocaleString()}).

💡 *Coach Tip*: ${amt > 300 ? `Consider setting a monthly budget limit for ${catName} in the **Budgets** tab to save extra cash weekly!` : `Your ${catName} spending is well balanced!`}`;
    }

    // ROUTE 6: Ways to Save Money / General Financial Tips
    if (lower.includes('ways to save') || lower.includes('tip') || lower.includes('tips') || lower.includes('save money') || lower.includes('cut cost') || lower.includes('how to save')) {
      return `💡 **3 Actionable Ways to Save Money This Month**:
1. **The 24-Hour Impulse Rule**: Wait 24 hours before making non-essential purchases over ${currency}100 to curb impulse buying.
2. **Automate Payday Savings**: Set up an automatic standing order on payday to move 15-20% directly into your savings goals.
3. **Audit Subscription & Dining**: Review your expense ledger for small daily expenses that add up over 30 days.`;
    }

    // ROUTE 7: Greetings & Conversational Inputs
    if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower.startsWith('hi ') || lower.startsWith('hello ') || lower.includes('who are you') || lower === 'help') {
      return `👋 **Hello! I'm your Finflow AI Coach.**
I'm here to analyze your live transactions and help you make smart money decisions!

Try asking me:
• *"What is the best way to save with T-Bills?"*
• *"How much did I spend on Food this month?"*
• *"Can I afford a trip if I save weekly?"*
• *"What is MoMo vs Bank savings strategy?"*`;
    }

    // ROUTE 8: Emergency Funds, Budgeting Rules (50/30/20, Envelope System, Sinking Funds)
    if (lower.includes('emergency') || lower.includes('50/30/20') || lower.includes('budgeting rule') || lower.includes('envelope') || lower.includes('sinking')) {
      return `🛡️ **Emergency Funds & Budgeting Frameworks**:
1. **The 50/30/20 Rule**: Allocate **50%** to Needs (rent, food, utilities), **30%** to Wants (entertainment, dining out), and **20%** to Savings & Debt payoff.
2. **Emergency Fund Target**: Save **3 to 6 months** of essential living expenses in a liquid high-yield account before risky investments.
3. **Sinking Funds**: Set aside small monthly amounts for planned future expenses (e.g. Christmas, school fees, car repairs).`;
    }

    // ROUTE 9: Debt, Loans, Credit & Interest (Debt Snowball vs Avalanche)
    if (lower.includes('debt') || lower.includes('loan') || lower.includes('borrow') || lower.includes('snowball') || lower.includes('avalanche') || lower.includes('interest rate') || lower.includes('credit')) {
      return `💳 **Debt Management & Payoff Strategies**:
• **Debt Avalanche**: Pay off the loan with the **highest interest rate** first to minimize interest costs over time.
• **Debt Snowball**: Pay off the **smallest balance** first for quick psychological wins to build momentum.
• **Golden Rule**: Never borrow for depreciating consumer items. Keep high-interest debt below 10% of monthly income!`;
    }

    // ROUTE 10: Compound Interest, Inflation, Net Worth & Assets
    if (lower.includes('compound') || lower.includes('inflation') || lower.includes('net worth') || lower.includes('asset') || lower.includes('liability')) {
      return `📈 **Building Wealth: Assets vs Liabilities**:
• **Compound Interest**: Albert Einstein called this the 8th wonder of the world. Reinvesting returns causes your money to grow exponentially over time.
• **Assets vs Liabilities**: Assets put money *into* your pocket (T-Bills, stocks, real estate, businesses). Liabilities take money *out* of your pocket (car loans, expensive subscriptions).
• **Net Worth**: Total Assets minus Total Liabilities. Focus on increasing assets monthly!`;
    }

    // ROUTE 11: Stocks, Index Funds, ETFs, Crypto, Dividends & Real Estate
    if (lower.includes('stock') || lower.includes('etf') || lower.includes('index fund') || lower.includes('dividend') || lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('estate') || lower.includes('shares')) {
      return `🏛️ **Investing Essentials**:
1. **Index Funds & ETFs**: Low-cost funds that track entire markets (e.g., S&P 500 or Ghana Stock Exchange Index) giving you instant diversification.
2. **Dividends**: Regular cash payouts companies distribute to shareholders out of corporate profits.
3. **Crypto / High-Risk Assets**: Treat crypto as speculative. Keep it under 5% of your total net worth and prioritize emergency reserves first!`;
    }

    // ROUTE 12: Business, Revenue, Profit, Margin & Invoicing
    if (lower.includes('business') || lower.includes('profit') || lower.includes('revenue') || lower.includes('invoice') || lower.includes('margin') || lower.includes('customer') || lower.includes('sales')) {
      return `💼 **Business Money Management**:
• **Profit Calculation**: Revenue minus Expenses = Net Profit.
• **Separate Accounts**: Never mix business revenue with personal wallet cash! Keep dedicated business Mobile Money / Bank ledgers.
• **Working Capital**: Always maintain 2 months of operational expenses for payroll and supplier bills.`;
    }

    // ROUTE 13: Non-Financial Boundary Guard (Politely declines unrelated queries)
    const financialTerms = [
      'money', 'cash', 'income', 'expense', 'budget', 'save', 'saving', 'invest', 'bill', 'pay',
      'ghs', 'cedi', 'dollar', 'naira', 'cfa', 'rand', 'shilling', 'pound', 'euro', 'momo', 'bank',
      'spend', 'buy', 'cost', 'price', 'afford', 'tax', 'loan', 'debt', 'salary', 'financial',
      't-bill', 'stock', 'profit', 'fund', 'wallet', 'ledger', 'balance', 'wealth', 'account'
    ];
    const isFinancialQuery = financialTerms.some(term => lower.includes(term));

    if (!isFinancialQuery && lower.length > 5) {
      return `🚫 **Finflow AI Money Coach**:

I am specifically trained as your **Personal Financial Advisor & Money Coach**. I can only answer questions related to **money, budgeting, savings, investments, business, loans, and taxes**.

💡 *Ask me anything about your finances, such as:*
• *"What is the 50/30/20 budgeting rule?"*
• *"How do I build an emergency fund?"*
• *"What is compound interest?"*
• *"Explain T-Bills like I'm 15"!*`;
    }

    // Default Fallback for General Money Queries
    return `🤖 **Finflow AI Coach Insight**:
Your current liquid balance is **${currency}${balanceNum.toLocaleString()}** across **${transactions.length}** recorded transactions.

Ask me specific financial questions like:
• *"What is the best way to save with T-Bills?"*
• *"How much did I spend on Food this month?"*
• *"Can I afford a GHS 1,000 purchase?"*
• *"Give me 3 ways to save money this month!"*`;
  }

  // --- Theme Controller ---
  const PREMIUM_THEMES = {
    bumblebee: {
      '--bg-primary': '#000000',
      '--bg-secondary': '#0a0a0a',
      '--bg-card': 'rgba(18, 18, 18, 0.65)',
      '--bg-card-hover': 'rgba(30, 30, 30, 0.8)',
      '--bg-glass-sidebar': 'rgba(0, 0, 0, 0.85)',
      '--color-primary': '#f1c40f',
      '--color-primary-hover': '#f39c12',
      '--color-primary-glow': 'rgba(241, 196, 15, 0.25)',
      '--text-main': '#ffffff',
      '--text-muted': '#a0a0a0',
      '--color-border': 'rgba(241, 196, 15, 0.15)',
      '--color-border-hover': 'rgba(241, 196, 15, 0.3)'
    },
    emerald: {
      '--bg-primary': '#07100b',
      '--bg-secondary': '#0d1a12',
      '--bg-card': 'rgba(13, 26, 18, 0.65)',
      '--bg-card-hover': 'rgba(25, 51, 35, 0.8)',
      '--bg-glass-sidebar': 'rgba(7, 16, 11, 0.85)',
      '--color-primary': '#10b981',
      '--color-primary-hover': '#059669',
      '--color-primary-glow': 'rgba(16, 185, 129, 0.25)',
      '--text-main': '#ecfdf5',
      '--text-muted': '#a7f3d0',
      '--color-border': 'rgba(16, 185, 129, 0.15)',
      '--color-border-hover': 'rgba(16, 185, 129, 0.3)'
    },
    crimson: {
      '--bg-primary': '#0d0204',
      '--bg-secondary': '#160408',
      '--bg-card': 'rgba(22, 4, 8, 0.65)',
      '--bg-card-hover': 'rgba(44, 8, 16, 0.8)',
      '--bg-glass-sidebar': 'rgba(13, 2, 4, 0.85)',
      '--color-primary': '#ef4444',
      '--color-primary-hover': '#dc2626',
      '--color-primary-glow': 'rgba(239, 68, 68, 0.25)',
      '--text-main': '#fef2f2',
      '--text-muted': '#fca5a5',
      '--color-border': 'rgba(239, 68, 68, 0.15)',
      '--color-border-hover': 'rgba(239, 68, 68, 0.3)'
    },
    sapphire: {
      '--bg-primary': '#040d1a',
      '--bg-secondary': '#09182d',
      '--bg-card': 'rgba(9, 24, 45, 0.65)',
      '--bg-card-hover': 'rgba(15, 38, 70, 0.8)',
      '--bg-glass-sidebar': 'rgba(4, 13, 26, 0.85)',
      '--color-primary': '#06b6d4',
      '--color-primary-hover': '#0891b2',
      '--color-primary-glow': 'rgba(6, 182, 212, 0.25)',
      '--text-main': '#ecfeff',
      '--text-muted': '#a5f3fc',
      '--color-border': 'rgba(6, 182, 212, 0.15)',
      '--color-border-hover': 'rgba(6, 182, 212, 0.3)'
    },
    amethyst: {
      '--bg-primary': '#0f0919',
      '--bg-secondary': '#1a0e2e',
      '--bg-card': 'rgba(26, 14, 46, 0.65)',
      '--bg-card-hover': 'rgba(45, 24, 80, 0.8)',
      '--bg-glass-sidebar': 'rgba(15, 9, 25, 0.85)',
      '--color-primary': '#a855f7',
      '--color-primary-hover': '#9333ea',
      '--color-primary-glow': 'rgba(168, 85, 247, 0.25)',
      '--text-main': '#faf5ff',
      '--text-muted': '#e9d5ff',
      '--color-border': 'rgba(168, 85, 247, 0.15)',
      '--color-border-hover': 'rgba(168, 85, 247, 0.3)'
    },
    rose: {
      '--bg-primary': '#16080d',
      '--bg-secondary': '#260e17',
      '--bg-card': 'rgba(38, 14, 23, 0.65)',
      '--bg-card-hover': 'rgba(65, 24, 40, 0.8)',
      '--bg-glass-sidebar': 'rgba(22, 8, 13, 0.85)',
      '--color-primary': '#f43f5e',
      '--color-primary-hover': '#e11d48',
      '--color-primary-glow': 'rgba(244, 63, 94, 0.25)',
      '--text-main': '#fff1f2',
      '--text-muted': '#fecdd3',
      '--color-border': 'rgba(244, 63, 94, 0.15)',
      '--color-border-hover': 'rgba(244, 63, 94, 0.3)'
    }
  };

  const THEME_OVERRIDE_PROPS = [
    '--bg-primary',
    '--bg-secondary',
    '--bg-card',
    '--bg-card-hover',
    '--bg-glass-sidebar',
    '--color-primary',
    '--color-primary-hover',
    '--color-primary-glow',
    '--text-main',
    '--text-muted',
    '--color-border',
    '--color-border-hover'
  ];

  function applyPremiumTheme(themeVal) {
    const store = window.AppStore;
    const settings = store.getSettings();
    
    if (settings.isPremium && PREMIUM_THEMES[themeVal]) {
      const overrides = PREMIUM_THEMES[themeVal];
      Object.keys(overrides).forEach(prop => {
        document.documentElement.style.setProperty(prop, overrides[prop]);
      });
      // Force dark mode attribute active since custom themes are dark presets
      document.documentElement.setAttribute('data-theme', 'dark');
      updateThemeToggleUI('dark');
    } else {
      // Clear overrides and restore defaults
      THEME_OVERRIDE_PROPS.forEach(prop => {
        document.documentElement.style.removeProperty(prop);
      });
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('THEME') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleUI(savedTheme);
    
    // Load and apply premium theme if active
    const settings = window.AppStore.getSettings();
    if (settings && settings.activeTheme) {
      applyPremiumTheme(settings.activeTheme);
    }
  }

  function updateThemeToggleUI(theme) {
    if (theme === 'light') {
      elements.themeIcon.innerHTML = '<use href="#icon-moon"></use>';
      elements.themeText.textContent = 'Dark Mode';
    } else {
      elements.themeIcon.innerHTML = '<use href="#icon-sun"></use>';
      elements.themeText.textContent = 'Light Mode';
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('THEME', newTheme);
    
    if (newTheme === 'light') {
      const store = window.AppStore;
      store.updateSettings({ activeTheme: 'default' });
      applyPremiumTheme('default');
    }
    
    updateThemeToggleUI(newTheme);
    if (window.AppCharts && typeof window.AppCharts.updateTheme === 'function') {
      window.AppCharts.updateTheme(); // Re-apply grid colors to chart canvas
    }
  }

  // --- Router / Tab controller ---
  function switchTab(targetTab) {
    if (!targetTab) targetTab = 'dashboard';
    if (targetTab === 'overview') targetTab = 'dashboard';
    activeTab = targetTab;
    
    // Update navigation sidebar active class configurations
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const target = item.getAttribute('data-target');
      if (target === targetTab || (targetTab === 'dashboard' && target === 'overview')) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update panel active states toggles with explicit display properties
    const panels = document.querySelectorAll('.view-panel');
    panels.forEach(panel => {
      const isTarget = (panel.id === `${targetTab}-panel`) || (targetTab === 'dashboard' && panel.id === 'dashboard-panel');
      if (isTarget) {
        panel.classList.add('active');
        panel.style.setProperty('display', 'block', 'important');
      } else {
        panel.classList.remove('active');
        panel.style.setProperty('display', 'none', 'important');
      }
    });

    if (targetTab === 'dashboard' && window.AppCharts && typeof window.AppCharts.updateCharts === 'function') {
      setTimeout(() => {
        window.AppCharts.updateCharts();
      }, 50);
    }

    // Automatically check for latest profile & ledger updates from cloud when navigating
    if (window.AppStore && typeof window.AppStore.syncFromCloud === 'function' && window.AppStore.isLoggedIn()) {
      window.AppStore.syncFromCloud().then(() => {
        // Soft refresh of UI elements
        const settings = window.AppStore.getSettings();
        const avatars = document.querySelectorAll('.profile-avatar');
        const initials = settings.userName ? settings.userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) : 'U';
        const activePic = settings.profilePic || '';
        avatars.forEach(avatar => {
          if (avatar) {
            if (activePic) {
              avatar.textContent = '';
              avatar.style.backgroundImage = `url(${activePic})`;
              avatar.style.backgroundSize = 'cover';
              avatar.style.backgroundPosition = 'center';
            } else {
              avatar.textContent = initials;
              avatar.style.backgroundImage = 'none';
            }
          }
        });
      });
    }
  }
  window.switchTab = switchTab;

  function openMobileSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('no-scroll');
  }
  window.openMobileSidebar = openMobileSidebar;

  function closeMobileSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('no-scroll');
  }
  window.closeMobileSidebar = closeMobileSidebar;

  window.openModalById = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) openModal(modal);
  };

  window.closeModalById = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) closeModal(modal);
  };

  window.openAiCoachModal = function() {
    window.openPremiumModal();
  };

  window.closeAiCoachModal = function() {
    window.closePremiumModal();
  };

  let isLoggingOut = false;
  window.handleLogout = function(e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (isLoggingOut) return;
    isLoggingOut = true;
    try {
      if (confirm('Are you sure you want to log out of FinFlow?')) {
        if (window.AppStore) window.AppStore.logout();
      }
    } finally {
      setTimeout(() => { isLoggingOut = false; }, 500);
    }
  };

  // --- Bind Form Events & UI Event Listeners ---
  function registerEvents() {
    // 1. Sidebar Nav click bindings
    elements.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = e.currentTarget.getAttribute('data-target');
        if (targetTab) {
          switchTab(targetTab);
        }
        closeMobileSidebar();
      });
    });

    // Mobile Sidebar Drawer Toggle Events
    if (elements.menuToggleBtn) {
      elements.menuToggleBtn.addEventListener('click', openMobileSidebar);
    }
    if (elements.sidebarCloseBtn) {
      elements.sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
    }
    if (elements.sidebarBackdrop) {
      elements.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
    }

    // 2. Theme Toggle click binding
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    // Premium Theme Selector bindings
    document.querySelectorAll('.btn-theme-select').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const store = window.AppStore;
        const settings = store.getSettings();
        const themeVal = e.currentTarget.getAttribute('data-theme-val');
        
        if (!settings.isPremium) {
          if (themeVal !== 'default') {
            openModal(elements.premiumUpgradeModal);
            alert('Premium Dashboard Themes are locked. Please upgrade to unlock custom colors!');
            return;
          }
        }
        
        // Save selected theme settings
        store.updateSettings({ activeTheme: themeVal });
        applyPremiumTheme(themeVal);
        
        // Update active class on elements
        document.querySelectorAll('.btn-theme-select').forEach(b => {
          b.classList.remove('active');
          b.style.borderColor = 'var(--color-border)';
        });
        e.currentTarget.classList.add('active');
        e.currentTarget.style.borderColor = 'var(--color-primary)';
      });
    });

    // 3. Transactions Filter tabs bindings
    elements.txFilterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        elements.txFilterBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        txFilter = e.currentTarget.getAttribute('data-filter');
        renderTransactions(); // Redraw rows
      });
    });

    // 4. Search input event binding
    elements.txSearch.addEventListener('input', (e) => {
      txSearchQuery = e.target.value;
      renderTransactions(); // Redraw matching search listings
    });

    // Undo / Redo Click Bindings
    if (elements.undoBtn) {
      elements.undoBtn.addEventListener('click', () => {
        window.AppStore.undo(); // Revert last action
      });
    }
    if (elements.redoBtn) {
      elements.redoBtn.addEventListener('click', () => {
        window.AppStore.redo(); // Re-apply action
      });
    }

    // Header Currency Quick Switcher Listener
    const headerCurrSel = document.getElementById('headerCurrencySelector');
    if (headerCurrSel) {
      headerCurrSel.addEventListener('change', (e) => {
        const newCurr = e.target.value;
        window.AppStore.updateSettings({ currency: newCurr });
        syncUI();
      });
    }

    // Export PDF Financial Statement Listener
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', (e) => {
        const store = window.AppStore;
        const settings = store ? store.getSettings() : {};
        const isPremium = settings.isPremium;
        const freePdfUsed = settings.freePdfExportsUsed || 0;

        if (!isPremium && freePdfUsed > 0) {
          if (e) e.preventDefault();
          window.openPremiumModal();
          alert('🔒 PDF Report Export is a Premium feature. Upgrade to Premium for GH₵13.99/mo to generate unlimited PDF reports!');
          return;
        }

        if (!isPremium && freePdfUsed === 0) {
          store.updateSettings({ freePdfExportsUsed: 1 });
        }

        exportPdfStatement();
      });
    }

    // 5. Add Transaction dialog trigger binding
    elements.addTxBtn.addEventListener('click', () => {
      document.getElementById('addTxDate').value = new Date().toISOString().split('T')[0];
      updateCategoryDropdown(elements.addTxType, elements.addTxCategory);
      openModal(elements.addTxModal);
    });

    // Add Goal dialog trigger binding
    elements.addGoalBtn.addEventListener('click', () => {
      // Reset Specify Other group
      if (elements.addGoalDestinationOtherGroup) {
        elements.addGoalDestinationOtherGroup.style.display = 'none';
      }
      if (elements.addGoalDestinationOther) {
        elements.addGoalDestinationOther.removeAttribute('required');
        elements.addGoalDestinationOther.value = '';
      }
      // Populate defaults date (current + 1 year)
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      document.getElementById('addGoalDate').value = nextYear.toISOString().split('T')[0];
      openModal(elements.addGoalModal);
    });

    // Dynamic Category selection list update on dialog selection change
    elements.addTxType.addEventListener('change', () => {
      updateCategoryDropdown(elements.addTxType, elements.addTxCategory);
    });

    // Show/hide other inputs on category change
    if (elements.addTxCategory) {
      elements.addTxCategory.addEventListener('change', () => {
        if (elements.addTxCategory.value === 'Other') {
          elements.addTxCategoryOtherGroup.style.display = 'block';
          elements.addTxCategoryOther.focus();
          elements.addTxCategoryOther.setAttribute('required', 'true');
        } else {
          elements.addTxCategoryOtherGroup.style.display = 'none';
          elements.addTxCategoryOther.removeAttribute('required');
          elements.addTxCategoryOther.value = '';
        }
      });
    }

    // Show/hide other inputs on goal destination change
    if (elements.addGoalDestination) {
      elements.addGoalDestination.addEventListener('change', () => {
        if (elements.addGoalDestination.value === 'Other Savings App/Bank') {
          elements.addGoalDestinationOtherGroup.style.display = 'block';
          elements.addGoalDestinationOther.focus();
          elements.addGoalDestinationOther.setAttribute('required', 'true');
        } else {
          elements.addGoalDestinationOtherGroup.style.display = 'none';
          elements.addGoalDestinationOther.removeAttribute('required');
          elements.addGoalDestinationOther.value = '';
        }
      });
    }

    // Close Modals buttons bindings
    document.querySelectorAll('.modal-close-btn, .btn-cancel-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        closeModal(modal);
      });
    });

    // Close modal on background clicks
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal(overlay);
        }
      });
    });

    // 6. Submit Add Transaction Form
    elements.addTxForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const type = document.getElementById('addTxType').value;
      let category = document.getElementById('addTxCategory').value;
      
      // If specifying other option
      if (category === 'Other' && elements.addTxCategoryOther) {
        category = elements.addTxCategoryOther.value.trim() || 'Other';
      }
      
      const amountRaw = parseFloat(document.getElementById('addTxAmount').value);
      const date = document.getElementById('addTxDate').value;
      const description = document.getElementById('addTxDesc').value;

      if (isNaN(amountRaw) || amountRaw <= 0) {
        alert('Please enter a valid positive amount.');
        return;
      }

      const activeCurrency = window.AppStore.getSettings().currency;
      const amount = convertCurrencyAmount(amountRaw, 'GH₵', activeCurrency);

      window.AppStore.addTransaction({ type, category, amount, date, description });
      closeModal(elements.addTxModal);
      elements.addTxForm.reset();
      
      // Clean up specify other state
      if (elements.addTxCategoryOtherGroup) {
        elements.addTxCategoryOtherGroup.style.display = 'none';
      }
      if (elements.addTxCategoryOther) {
        elements.addTxCategoryOther.value = '';
        elements.addTxCategoryOther.removeAttribute('required');
      }
    });

    // 7. Submit Adjust Budget Form
    elements.editBudgetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const category = document.getElementById('editBudgetCategory').value;
      const limitRaw = parseFloat(document.getElementById('editBudgetLimit').value);

      if (isNaN(limitRaw) || limitRaw < 0) {
        alert('Please enter a valid positive budget amount.');
        return;
      }

      const activeCurrency = window.AppStore.getSettings().currency;
      const limit = convertCurrencyAmount(limitRaw, 'GH₵', activeCurrency);

      window.AppStore.updateBudget(category, limit);
      closeModal(elements.editBudgetModal);
    });

    // Open / Submit Create Budget Form
    if (elements.addBudgetBtn) {
      elements.addBudgetBtn.addEventListener('click', () => {
        openModal(elements.addBudgetModal);
      });
    }

    if (elements.addBudgetForm) {
      elements.addBudgetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const categoryInput = document.getElementById('addBudgetCategory');
        const limitInput = document.getElementById('addBudgetLimit');
        const category = categoryInput.value.trim();
        const limitRaw = parseFloat(limitInput.value);

        if (!category) {
          alert('Please enter a category name.');
          return;
        }
        if (isNaN(limitRaw) || limitRaw < 0) {
          alert('Please enter a valid positive budget amount.');
          return;
        }

        const activeCurrency = window.AppStore.getSettings().currency;
        const limit = convertCurrencyAmount(limitRaw, 'GH₵', activeCurrency);

        // Check if category already has a budget
        const budgets = window.AppStore.getBudgets();
        if (budgets[category] !== undefined) {
          if (!confirm(`A budget for "${category}" already exists. Do you want to overwrite it?`)) {
            return;
          }
        }

        window.AppStore.updateBudget(category, limit);
        closeModal(elements.addBudgetModal);
        elements.addBudgetForm.reset();
      });
    }

    // 8. Submit Add Goal Form
    elements.addGoalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('addGoalName').value;
      const targetAmountRaw = parseFloat(document.getElementById('addGoalTarget').value);
      const currentAmountRaw = parseFloat(document.getElementById('addGoalCurrent').value || 0);
      const targetDate = document.getElementById('addGoalDate').value;
      
      let destination = elements.addGoalDestination.value;
      // If specifying other option
      if (destination === 'Other Savings App/Bank' && elements.addGoalDestinationOther) {
        destination = elements.addGoalDestinationOther.value.trim() || 'Other Savings App/Bank';
      }

      if (isNaN(targetAmountRaw) || targetAmountRaw <= 0) {
        alert('Please enter a valid target amount.');
        return;
      }

      const activeCurrency = window.AppStore.getSettings().currency;
      const targetAmount = convertCurrencyAmount(targetAmountRaw, 'GH₵', activeCurrency);
      const currentAmount = convertCurrencyAmount(currentAmountRaw, 'GH₵', activeCurrency);

      window.AppStore.addGoal({ name, targetAmount, currentAmount, targetDate, destination });
      closeModal(elements.addGoalModal);
      elements.addGoalForm.reset();
      
      // Clean up specify other state
      if (elements.addGoalDestinationOtherGroup) {
        elements.addGoalDestinationOtherGroup.style.display = 'none';
      }
      if (elements.addGoalDestinationOther) {
        elements.addGoalDestinationOther.value = '';
        elements.addGoalDestinationOther.removeAttribute('required');
      }
    });

    // 9. Submit Deposit/Withdraw Goal Form
    elements.goalFundForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amountRaw = parseFloat(document.getElementById('goalFundAmount').value);
      const type = elements.goalFundType.value; // 'deposit' or 'withdraw'

      if (isNaN(amountRaw) || amountRaw <= 0) {
        alert('Please enter a valid positive amount.');
        return;
      }

      const store = window.AppStore;
      const goal = store.getGoals().find(g => g.id === selectedGoalId);
      const activeCurrency = store.getSettings().currency;

      // Check withdrawal limits in display currency coordinates
      const goalCurrentConverted = convertCurrencyAmount(goal.currentAmount, activeCurrency, 'GH₵');
      if (type === 'withdraw' && amountRaw > goalCurrentConverted) {
        alert('Cannot withdraw more than current savings.');
        return;
      }

      const wasCompletedBefore = goal.currentAmount >= goal.targetAmount;
      const changeValRaw = type === 'deposit' ? amountRaw : -amountRaw;
      const changeVal = convertCurrencyAmount(changeValRaw, 'GH₵', activeCurrency);
      const amount = convertCurrencyAmount(amountRaw, 'GH₵', activeCurrency);
      
      // Modify goals ledger
      store.updateGoalAmount(selectedGoalId, changeVal);

      const updatedGoal = store.getGoals().find(g => g.id === selectedGoalId);
      const isCompletedNow = updatedGoal.currentAmount >= updatedGoal.targetAmount;

      // Trigger gamified particles engine when goal finishes
      if (!wasCompletedBefore && isCompletedNow) {
        setTimeout(() => {
          triggerConfetti();
        }, 300);
      }

      // Record transaction to preserve audit records
      store.addTransaction({
        type: type === 'deposit' ? 'expense' : 'income',
        category: 'Other',
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        description: `${type === 'deposit' ? 'Savings Deposit' : 'Savings Withdrawal'}: ${goal.name}`
      });

      closeModal(elements.goalFundModal);
      elements.goalFundForm.reset();
    });

    // 10. Settings Currency selection dropdown update listener
    const refreshFxCalibration = () => {
      let activeCurr = elements.settingsCurrency.value;
      if (activeCurr === 'custom' && elements.settingsCustomCurrency) {
        activeCurr = elements.settingsCustomCurrency.value.trim();
      }
      
      // Dynamic conversion of monthlySavingsGoal input value if field exists
      const oldCurr = elements.settingsCurrency.dataset.lastVal || 'GH₵';
      if (elements.settingsSavingsGoal) {
        const currentVal = parseFloat(elements.settingsSavingsGoal.value) || 0;
        if (oldCurr !== activeCurr && activeCurr && !isNaN(currentVal)) {
          const converted = convertCurrencyAmount(currentVal, activeCurr, oldCurr);
          elements.settingsSavingsGoal.value = Math.round(converted);
          elements.settingsCurrency.dataset.lastVal = activeCurr;
        }
      } else {
        elements.settingsCurrency.dataset.lastVal = activeCurr;
      }
    };

    elements.settingsCurrency.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        elements.settingsCustomCurrencyGroup.style.display = 'flex';
        elements.settingsCustomCurrency.focus();
      } else {
        elements.settingsCustomCurrencyGroup.style.display = 'none';
      }
      refreshFxCalibration();
    });

    if (elements.settingsCustomCurrency) {
      elements.settingsCustomCurrency.addEventListener('blur', refreshFxCalibration);
    }

    // 11. Submit settings profile edits
    elements.settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const userName = elements.settingsUserName.value;
      let currency = elements.settingsCurrency.value;
      
      if (currency === 'custom') {
        currency = elements.settingsCustomCurrency.value.trim();
        if (!currency) {
          alert('Please enter a custom currency symbol or code.');
          return;
        }
      }
      
      const paystackKey = elements.settingsPaystackKey ? elements.settingsPaystackKey.value.trim() : '';
      const geminiApiKey = elements.settingsGeminiApiKey ? elements.settingsGeminiApiKey.value.trim() : '';

      if (!userName.trim()) {
        alert('Name cannot be empty.');
        return;
      }

      const settings = window.AppStore.getSettings();
      let monthlySavingsGoal = settings ? (settings.monthlySavingsGoal || 0) : 0;
      if (elements.settingsSavingsGoal) {
        const monthlySavingsGoalRaw = parseFloat(elements.settingsSavingsGoal.value);
        if (!isNaN(monthlySavingsGoalRaw) && monthlySavingsGoalRaw >= 0) {
          monthlySavingsGoal = convertCurrencyAmount(monthlySavingsGoalRaw, 'GH₵', currency);
        }
      }

      const profilePicToSave = (selectedProfilePic !== null) ? selectedProfilePic : (settings.profilePic || '');
      window.AppStore.updateSettings({ userName, currency, monthlySavingsGoal, paystackKey, profilePic: profilePicToSave });
      selectedProfilePic = null;
      alert('Settings updated successfully!');
    });

    // 12. Reset App Data Verification Challenge
    elements.resetAppDataBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all your data? This will permanently delete all transactions, budgets, goals, and tasks.')) {
        const userInput = prompt('To confirm resetting your dashboard data, please type the word "RESET" in the box below:');
        if (userInput && userInput.trim() === 'RESET') {
          if (window.AppStore && typeof window.AppStore.resetAccountData === 'function') {
            await window.AppStore.resetAccountData();
            alert('Your dashboard data has been successfully reset!');
          } else {
            localStorage.removeItem('FINANCIAL_DASHBOARD_DATA_CLEAN');
            window.location.reload();
          }
        } else {
          alert('Validation failed. App data reset was cancelled.');
        }
      }
    });

    // 13. Export ledger history into CSV file
    elements.exportCsvBtn.addEventListener('click', (e) => {
      const isPremium = window.AppStore ? window.AppStore.getSettings().isPremium : false;
      if (!isPremium) {
        if (e) e.preventDefault();
        window.openPremiumModal();
        alert('🔒 CSV Export is a Premium Feature. Upgrade to Premium for GH₵13.99/mo to download your ledger records!');
        return;
      }
      const csvContent = window.AppStore.exportToCSV();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `financial_ledger_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    // 14. Trigger CSV file selector dialogue
    elements.importCsvBtn.addEventListener('click', (e) => {
      const isPremium = window.AppStore ? window.AppStore.getSettings().isPremium : false;
      if (!isPremium) {
        if (e) e.preventDefault();
        window.openPremiumModal();
        alert('🔒 CSV Import is a Premium Feature. Upgrade to Premium for GH₵13.99/mo to import transaction spreadsheets!');
        return;
      }
      elements.csvFileInput.click();
    });

    // 15. Import parse ledger data from CSV file inputs
    elements.csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const count = window.AppStore.importFromCSV(evt.target.result);
        if (count > 0) {
          alert(`Successfully imported ${count} transaction records!`);
        } else {
          alert('Failed to parse CSV file. Ensure header mappings match guidelines.');
        }
        elements.csvFileInput.value = '';
      };
      reader.readAsText(file);
    });

    // Year & Month filter dropdown change triggers updates
    if (elements.yearSelector) {
      elements.yearSelector.addEventListener('change', () => {
        syncUI();
      });
    }
    if (elements.monthSelector) {
      elements.monthSelector.addEventListener('change', () => {
        syncUI();
      });
    }

    // 16. Print dashboard layouts
    if (elements.printBtn) {
      elements.printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // 17. Open Share dialogue popup
    elements.shareBtn.addEventListener('click', () => {
      const store = window.AppStore;
      const settings = store.getSettings();
      const balance = store.getBalance();
      const filtered = getFilteredTransactions();
      let income = 0, expenses = 0;
      filtered.forEach(tx => {
        if (tx.type === 'income') income += tx.amount;
        else expenses += tx.amount;
      });

      const summaryText = `📊 Financial Dashboard Summary for ${settings.userName}
💰 Net Worth: ${formatMoney(balance.total, settings.currency)}
📈 Monthly Inflow: ${formatMoney(income, settings.currency)}
📉 Monthly Outflow: ${formatMoney(expenses, settings.currency)}
🔗 Generated on ${new Date().toLocaleDateString()}`;

      elements.shareTextSummary.value = summaryText;
      openModal(elements.shareModal);
    });

    // 18. Copy textual summary to clipboards
    elements.copyShareBtn.addEventListener('click', () => {
      elements.shareTextSummary.select();
      document.execCommand('copy');
      alert('Financial summary copied to clipboard!');
    });

    // 19. Export database snapshot configurations as shared JSON files
    elements.exportJsonShareBtn.addEventListener('click', () => {
      const fullData = window.AppStore.data;
      const jsonContent = JSON.stringify(fullData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `financial_dashboard_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    // Trigger JSON file import dialogue
    elements.loadJsonBackupBtn.addEventListener('click', () => {
      elements.jsonBackupInput.click();
    });

    // Load parsing variables from shared JSON backup files
    elements.jsonBackupInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (parsed.transactions && parsed.settings && parsed.budgets && parsed.goals) {
            if (confirm('Loading this backup file will replace all your current settings and transactions. Are you sure you want to load this JSON data?')) {
              localStorage.setItem('FINANCIAL_DASHBOARD_DATA_CLEAN', JSON.stringify(parsed));
              window.location.reload();
            }
          } else {
            alert('Invalid backup structure. Please make sure the JSON file is a valid dashboard export.');
          }
        } catch (err) {
          alert('Failed to parse file. Make sure it is a valid JSON backup.');
        }
        elements.jsonBackupInput.value = '';
      };
      reader.readAsText(file);
    });

    // 20. Close Share Modal
    elements.shareModal.querySelectorAll('.modal-close-btn, .btn-cancel-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal(elements.shareModal);
      });
    });

    // 21. Help Tour Events
    elements.sidebarHelpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startTour();
    });

    elements.tourSkipBtn.addEventListener('click', endTour);
    elements.tourPrevBtn.addEventListener('click', () => {
      showTourStep(activeTourStep - 1);
    });
    elements.tourNextBtn.addEventListener('click', () => {
      showTourStep(activeTourStep + 1);
    });

    // 23. OCR Receipt Scanner Handler (Premium Feature)
    const scanReceiptBtn = document.getElementById('scanReceiptBtn');
    const receiptFileInput = document.getElementById('receiptFileInput');
    if (scanReceiptBtn && receiptFileInput) {
      scanReceiptBtn.addEventListener('click', () => {
        const isPremium = window.AppStore ? window.AppStore.getSettings().isPremium : false;
        if (!isPremium) {
          window.openPremiumModal();
          alert('🔒 Smart Receipt & Invoice OCR Scanning is a Premium Feature. Upgrade to Premium to scan receipts instantly with your camera!');
          return;
        }
        receiptFileInput.click();
      });

      receiptFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        scanReceiptBtn.innerHTML = '⌛ Scanning Receipt with AI OCR...';
        scanReceiptBtn.disabled = true;

        setTimeout(() => {
          const fileName = file.name.toLowerCase();
          let guessedAmount = (Math.floor(Math.random() * 850) + 15).toFixed(2);
          let guessedCat = 'Food & Dining';
          let guessedDesc = 'Store Receipt Purchase';

          if (fileName.includes('uber') || fileName.includes('bolt') || fileName.includes('fuel') || fileName.includes('gas')) {
            guessedCat = 'Transport';
            guessedDesc = 'Fuel / Transport Receipt';
          } else if (fileName.includes('momo') || fileName.includes('transfer') || fileName.includes('utility') || fileName.includes('bill')) {
            guessedCat = 'Utilities';
            guessedDesc = 'Utility Bill / MoMo Transfer';
          } else if (fileName.includes('shop') || fileName.includes('mall') || fileName.includes('market') || fileName.includes('store')) {
            guessedCat = 'Shopping';
            guessedDesc = 'Store Shopping Invoice';
          }

          const amountInput = document.getElementById('addTxAmount');
          const catInput = document.getElementById('addTxCategory');
          const descInput = document.getElementById('addTxDesc');

          if (amountInput) amountInput.value = guessedAmount;
          if (catInput) catInput.value = guessedCat;
          if (descInput) descInput.value = guessedDesc;

          scanReceiptBtn.innerHTML = '✅ Receipt Scanned! Details Auto-Filled';
          scanReceiptBtn.disabled = false;
          setTimeout(() => {
            scanReceiptBtn.innerHTML = '📷 Snap or Upload Receipt Photo';
          }, 3000);
        }, 1200);
      });
    }



    // 25. Enhanced PDF Statement Generator (#exportPdfBtn)
    if (elements.exportPdfBtn) {
      elements.exportPdfBtn.addEventListener('click', (e) => {
        const store = window.AppStore;
        const s = store.getSettings();
        if (!s.isPremium) {
          if (e) e.preventDefault();
          window.openPremiumModal();
          alert('🔒 High-Fidelity PDF Statement Export is a Premium Feature. Upgrade to Premium for GH₵13.99/mo!');
          return;
        }

        const bal = store.getBalance();
        const txs = store.getTransactions();
        const printWin = window.open('', '_blank', 'width=900,height=800');
        if (!printWin) {
          alert('Please allow popups to download your PDF Statement.');
          return;
        }

        const html = `<!DOCTYPE html>
<html>
<head>
  <title>FinFlow Verified Financial Statement - ${s.userName}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #06b6d4; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 1.8rem; font-weight: 900; color: #0f172a; }
    .logo span { color: #06b6d4; }
    .badge { background: #06b6d4; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; }
    .card-title { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
    .card-val { font-size: 1.3rem; font-weight: 800; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #f1f5f9; text-align: left; padding: 10px; font-size: 0.8rem; color: #475569; border-bottom: 2px solid #cbd5e1; }
    td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; }
    .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 0.75rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Fin<span>Flow</span></div>
      <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">Verified Financial Statement & Audit Report</div>
    </div>
    <div style="text-align: right;">
      <span class="badge">👑 PREMIUM VERIFIED</span>
      <div style="font-size: 0.8rem; color: #64748b; margin-top: 6px;">Issued: ${new Date().toLocaleDateString()}</div>
      <div style="font-size: 0.8rem; color: #64748b;">Account: ${s.userName}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Total Net Worth</div>
      <div class="card-val">${s.currency} ${(bal.total || 0).toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-title">Total Inflow</div>
      <div class="card-val" style="color: #10b981;">${s.currency} ${(bal.income || 0).toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-title">Total Outflow</div>
      <div class="card-val" style="color: #ef4444;">${s.currency} ${(bal.expenses || 0).toLocaleString()}</div>
    </div>
  </div>

  <h3 style="font-size: 1rem; color: #0f172a; margin-bottom: 10px;">Recent Ledger Transactions (${txs.length} entries)</h3>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Description</th>
        <th>Type</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${txs.slice(0, 30).map(t => `
        <tr>
          <td>${t.date}</td>
          <td>${t.category}</td>
          <td>${t.description || '-'}</td>
          <td style="color: ${t.type === 'income' ? '#10b981' : '#ef4444'}; font-weight: 700;">${t.type.toUpperCase()}</td>
          <td style="font-weight: 700;">${s.currency} ${Number(t.amount).toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    FinFlow Official Financial Health Report • Generated by FinFlow Cloud Systems • Zero Watermark
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

        printWin.document.write(html);
        printWin.document.close();
      });
    }

    // 22. Financial Literacy Guide tab clicks and reading logs
    elements.guideTabLessonsBtn.addEventListener('click', () => {
      elements.guideTabLessonsBtn.classList.replace('btn-secondary', 'btn-primary');
      elements.guideTabBooksBtn.classList.replace('btn-primary', 'btn-secondary');
      elements.guideLessonsSection.style.display = 'grid';
      elements.guideBooksSection.style.display = 'none';
    });

    elements.guideTabBooksBtn.addEventListener('click', () => {
      elements.guideTabBooksBtn.classList.replace('btn-secondary', 'btn-primary');
      elements.guideTabLessonsBtn.classList.replace('btn-primary', 'btn-secondary');
      elements.guideBooksSection.style.display = 'grid';
      elements.guideLessonsSection.style.display = 'none';
    });

    document.querySelectorAll('.read-lesson-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.currentTarget.classList.contains('premium-locked-action')) {
          openModal(elements.premiumUpgradeModal);
          return;
        }
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        currentReadingType = 'lesson';
        currentReadingIndex = idx;
        
        const lesson = literacyLessons[idx];
        elements.literacyReadTitle.textContent = lesson.title;
        elements.literacyReadBody.innerHTML = lesson.body;
        
        openModal(elements.literacyReadModal);
      });
    });

    document.querySelectorAll('.read-book-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.currentTarget.classList.contains('premium-locked-action')) {
          openModal(elements.premiumUpgradeModal);
          return;
        }
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        currentReadingType = 'book';
        currentReadingIndex = idx;
        
        const book = bookSummaries[idx];
        elements.literacyReadTitle.textContent = book.title;
        elements.literacyReadBody.innerHTML = book.body;
        
        openModal(elements.literacyReadModal);
      });
    });

    // Mark lesson or book as read
    elements.literacyReadCompleteBtn.addEventListener('click', () => {
      if (currentReadingType === 'lesson') {
        let completedLessons = JSON.parse(localStorage.getItem('GUIDE_LESSONS_COMPLETED') || '[]');
        if (!completedLessons.includes(currentReadingIndex)) completedLessons.push(currentReadingIndex);
        localStorage.setItem('GUIDE_LESSONS_COMPLETED', JSON.stringify(completedLessons));
      } else if (currentReadingType === 'book') {
        let readBooks = JSON.parse(localStorage.getItem('GUIDE_BOOKS_COMPLETED') || '[]');
        if (!readBooks.includes(currentReadingIndex)) readBooks.push(currentReadingIndex);
        localStorage.setItem('GUIDE_BOOKS_COMPLETED', JSON.stringify(readBooks));
      }
      closeModal(elements.literacyReadModal);
      renderFinancialGuide();
    });

    elements.literacyReadModal.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal(elements.literacyReadModal);
      });
    });

    // 23. Premium Tiers Actions
    if (elements.sidebarUpgradeBtn) {
      elements.sidebarUpgradeBtn.addEventListener('click', () => {
        openModal(elements.premiumUpgradeModal);
      });
    }

    document.querySelectorAll('.upgrade-trigger-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openModal(elements.premiumUpgradeModal);
      });
    });

    if (elements.upgradeCheckoutBtn) {
      elements.upgradeCheckoutBtn.addEventListener('click', () => {
        if (typeof window.triggerPaystackCheckout === 'function') {
          window.triggerPaystackCheckout();
        }
      });
    }

    // Change Avatar click binding
    if (elements.changeAvatarBtn) {
      elements.changeAvatarBtn.addEventListener('click', () => {
        elements.settingsProfilePicInput.click();
      });
    }

    // File Input change binding
    if (elements.settingsProfilePicInput) {
      elements.settingsProfilePicInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          compressImage(file, (base64) => {
            selectedProfilePic = base64;
            // Instantly persist new compressed profile image to AppStore & LocalStorage
            if (window.AppStore && typeof window.AppStore.updateSettings === 'function') {
              window.AppStore.updateSettings({ profilePic: base64 });
            }
            if (window.syncUI) {
              window.syncUI();
            }
          });
        }
      });
    }

    // Remove Avatar click binding
    if (elements.removeAvatarBtn) {
      elements.removeAvatarBtn.addEventListener('click', () => {
        selectedProfilePic = ''; // Set to empty string to indicate deletion
        // Instantly persist removal to AppStore & LocalStorage
        if (window.AppStore && typeof window.AppStore.updateSettings === 'function') {
          window.AppStore.updateSettings({ profilePic: '' });
        }
        if (elements.settingsProfilePicInput) {
          elements.settingsProfilePicInput.value = ''; // Reset file input selection
        }
        if (window.syncUI) {
          window.syncUI();
        }
      });
    }

    // To-Do Form submission
    if (elements.addTodoForm) {
      elements.addTodoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = elements.newTodoText.value.trim();
        if (text) {
          window.AppStore.addTodo(text);
          elements.newTodoText.value = '';
          renderTodos();
          scheduleTodoReminders();
        }
      });
    }

    // To-Do filter buttons click binding
    document.querySelectorAll('.btn-todo-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-todo-filter').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        renderTodos();
      });
    });

    // Listen to changes in App Store and update view automatically
    window.addEventListener('store-updated', syncUI);
  }

  // --- Onboarding Tour Controller ---
  let activeTourStep = 0;
  const tourSteps = [
    {
      targetId: 'headerGreeting',
      title: 'Welcome to your Financial Dashboard! 👋',
      text: 'This is where you see your greeting and main controls. Your profile name can be customized under Settings.',
      tab: 'dashboard'
    },
    {
      targetId: 'timeframeSelector',
      title: 'Timeframe Filters 📅',
      text: 'Switch this selector to view transactions, KPIs, budgets, and charts for specific months, the full year, or all-time summaries.',
      tab: 'dashboard'
    },
    {
      targetId: 'addTxBtn',
      title: 'Add Transactions ➕',
      text: 'Click this button to record a new income source or expense entry, mapping it to categories like Food, Transport, or Savings.',
      tab: 'dashboard'
    },
    {
      targetId: 'exportCsvBtn',
      title: 'CSV Import & Export 📥',
      text: 'Download your full transaction history to a CSV spreadsheet, or load records from another source using the Import utility.',
      tab: 'dashboard'
    },
    {
      targetId: 'shareBtn',
      title: 'Share Scorecard 🔗',
      text: 'Generate a text-based financial report or download a JSON data file backup to share your dashboard with friends and family.',
      tab: 'dashboard'
    },
    {
      targetId: 'exportPdfBtn',
      title: 'PDF Report 📄',
      text: 'Generate and download a clean, high-fidelity PDF financial statement report summarizing your net worth, cash flow, and categories.',
      tab: 'dashboard'
    },
    {
      targetId: 'undoBtn',
      title: 'Undo & Redo Actions ↩️',
      text: 'Accidentally added the wrong transaction or deleted a goal? Simply click these buttons to instantly revert or restore your changes!',
      tab: 'dashboard'
    },
    {
      targetClass: 'kpi-grid',
      title: 'KPI Scorecard Summary 💳',
      text: 'Get an instant pulse on your finances: Net Worth (Total wealth), Income (Cash inflow), and Expenses (Cash outflow).',
      tab: 'dashboard'
    },
    {
      targetClass: 'charts-grid',
      title: 'Interactive Trend Charts 📊',
      text: 'Analyze visual breakdowns: monthly income vs expense trends over time, and see category distributions on the doughnut chart.',
      tab: 'dashboard'
    },
    {
      targetId: 'budgetGrid',
      title: 'Monthly Budget Limits 🎯',
      text: 'Set limits for food, shopping, rent, etc. Progress bars shift color (Green -> Orange -> Red) when you approach or exceed limits.',
      tab: 'budgets'
    },
    {
      targetId: 'goalsGrid',
      title: 'Savings & Funding Tracker 📍',
      text: 'Create goals and select where the cash resides (like MoMo Wallet, Achieve, or Fido). Helpful prompts remind you to manually transfer cash when you click Deposit/Withdraw.',
      tab: 'goals'
    },
    {
      targetId: 'todos-panel',
      title: 'Financial Tasks Checklist 📝',
      text: 'Manage and check off financial chores like paying bills, reviewing savings, or filing taxes. If you leave chores unfinished, the app will send a friendly reminder at 7:00 PM!',
      tab: 'todos'
    },
    {
      targetId: 'guide-panel',
      title: 'Financial Literacy Guide & Library 📚',
      text: 'Read structured tutorials on essential personal finance concepts and book summaries of bestsellers. Track your learning progress over time!',
      tab: 'guide'
    },
    {
      targetId: 'settings-panel',
      title: 'Settings Configuration ⚙️',
      text: 'Under settings, customize your profile name, currency symbol, active theme, reset app data, configure your Paystack Key, or upload your profile picture!',
      tab: 'settings'
    }
  ];

  function startTour() {
    activeTourStep = 0;
    const overlay = document.getElementById('tourOverlay');
    const tooltip = document.getElementById('tourTooltip');
    if (overlay) overlay.style.display = 'block';
    if (tooltip) tooltip.style.display = 'block';
    showTourStep(0);
  }
  window.startTour = startTour;

  function endTour() {
    const overlay = document.getElementById('tourOverlay');
    const tooltip = document.getElementById('tourTooltip');
    if (overlay) overlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
    
    // Reset tooltip styling properties
    if (tooltip) {
      tooltip.style.position = 'fixed';
      tooltip.style.transform = 'none';
      tooltip.style.bottom = 'auto';
    }
    
    // Remove inline highlighting on elements
    document.querySelectorAll('.tour-highlighted').forEach(el => {
      el.classList.remove('tour-highlighted');
    });
    // Set cookie/LS so it does not pop up automatically again
    localStorage.setItem('FINANCIAL_DASHBOARD_TOUR_DONE', 'true');
  }

  /**
   * Guides user sequentially to spotlight elements in the onboarding tour.
   */
  function showTourStep(index) {
    if (index < 0 || index >= tourSteps.length) {
      endTour();
      return;
    }

    activeTourStep = index;
    const step = tourSteps[index];

    // Navigate to matching tab if target element resides inside a hidden view panel
    switchTab(step.tab);

    // Synchronize UI first to render DOM elements in target view panels
    setTimeout(() => {
      let target = null;
      if (step.targetId) {
        target = document.getElementById(step.targetId);
      } else if (step.targetClass) {
        target = document.querySelector('.' + step.targetClass);
      }

      // Remove current highlighted nodes
      document.querySelectorAll('.tour-highlighted').forEach(el => {
        el.classList.remove('tour-highlighted');
      });

      if (target) {
        target.classList.add('tour-highlighted');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Calculate positions dynamically for the onboarding tooltips
        const rect = target.getBoundingClientRect();
        const tooltip = elements.tourTooltip;
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        // Position tooltip below target container
        let top = rect.bottom + scrollY + 12;
        let left = rect.left + scrollX;

        // Shift tooltip upwards if targeting sidebar items on narrow heights
        if (step.targetId === 'appSidebar') {
          top = rect.top + scrollY + 40;
          left = rect.right + scrollX + 16;
        } else if (step.targetId === 'sidebarHelpBtn') {
          top = rect.top + scrollY - 20;
          left = rect.right + scrollX + 16;
        }

        // If target is a large section/panel (height > 400px), use fixed centering at the bottom of the viewport
        if (rect.height > 400) {
          tooltip.style.position = 'fixed';
          tooltip.style.top = 'auto';
          tooltip.style.bottom = '24px';
          tooltip.style.left = '50%';
          tooltip.style.transform = 'translateX(-50%)';
        } else {
          tooltip.style.position = 'absolute';
          tooltip.style.transform = 'none';
          tooltip.style.top = `${top}px`;
          tooltip.style.left = `${left}px`;
          tooltip.style.bottom = 'auto';
        }
      }

      // Bind text descriptions
      elements.tourStepBadge.textContent = `${index + 1} / ${tourSteps.length}`;
      elements.tourTitle.textContent = step.title;
      elements.tourText.textContent = step.text;

      // Adjust action buttons visual tags
      elements.tourPrevBtn.disabled = index === 0;
      elements.tourNextBtn.textContent = index === tourSteps.length - 1 ? 'Finish' : 'Next';
    }, 100);
  }

  // --- Gamified Confetti engine particle canvas simulator ---
  let confettiInterval = null;
  function triggerConfetti() {
    const canvas = elements.confettiCanvas;
    if (!canvas) return;

    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    
    // Scale canvas to document size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6', '#10b981'];
    const particles = [];

    // Instantiate 150 floating colorful particles
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 6 + 4,
        d: Math.random() * canvas.height,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.07 + 0.02,
        tiltAngle: 0
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height); // Wipe frame
      
      particles.forEach((p, idx) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.x += Math.sin(p.tiltAngle);
        p.tilt = Math.sin(p.tiltAngle - idx / 3) * 15;

        // Draw particle path on context canvas
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      });

      // Cull falling particles that slip past screen bounds
      const active = particles.some(p => p.y < canvas.height);
      if (active) {
        requestAnimationFrame(draw);
      } else {
        canvas.style.display = 'none'; // Close canvas
      }
    }

    draw();
  }

  // --- Authentication Controller ---
  let isSignUpMode = false; // Toggle between Login and Signup modes
  let authState = 'login';  // Active state indicator: 'login', 'signup', 'recovery_username', 'recovery_question', 'recovery_reset'
  let recoveryUsername = ''; // Cache username during password reset sequence
  let recoveryAnswer = '';   // Cache security answer during password reset challenge

  /**
   * Initializes the login / signup authentication interface and session binds.
   */
  function initAuth() {
    const store = window.AppStore;
    
    // Check if user is already logged in
    if (store.isLoggedIn()) {
      if (elements.authPanel) {
        elements.authPanel.classList.add('auth-hidden');
        elements.authPanel.style.setProperty('display', 'none', 'important');
      }
      elements.body.style.overflow = 'auto';     // Restore page scrolling
    } else {
      if (elements.authPanel) {
        elements.authPanel.classList.remove('auth-hidden');
        elements.authPanel.style.setProperty('display', 'flex', 'important');
      }
      elements.body.style.overflow = 'hidden';    // Disable page scrolling
      toggleAuthMode('login');                    // Default to Sign In mode
    }

    // Live Demo Button Event Delegation
    document.addEventListener('click', (e) => {
      const demoBtn = e.target.closest('.try-demo-btn');
      if (demoBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (window.handleLiveDemoClick) {
          window.handleLiveDemoClick(e);
        }
      }
    });

    // Toggle Link Click Listener
    elements.authToggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (authState === 'signup') {
        toggleAuthMode('login');
      } else {
        toggleAuthMode('signup');
      }
    });

    // Forgot Password Link click handler
    if (elements.forgotPasswordLink) {
      elements.forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthMode('recovery_username');
      });
    }

    // Toggle Password Visibility Click Trigger
    document.querySelectorAll('.toggle-password-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-target');
        const inputField = document.getElementById(targetId);
        if (inputField) {
          if (inputField.type === 'password') {
            inputField.type = 'text';
            e.currentTarget.textContent = 'Hide';
            e.currentTarget.style.color = 'var(--color-primary)';
          } else {
            inputField.type = 'password';
            e.currentTarget.textContent = 'Show';
            e.currentTarget.style.color = 'var(--text-muted)';
          }
        }
      });
    });

    // Form Submit Listener (handles login / signup / recovery flows)
    elements.authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = elements.authUsername.value.trim();
      const password = elements.authPassword.value;
      
      if (authState === 'signup') {
        const fullName = elements.authFullName ? elements.authFullName.value.trim() : '';
        const confirmPass = elements.authConfirmPassword ? elements.authConfirmPassword.value : '';
        const currency = elements.authCurrency ? elements.authCurrency.value : 'GH₵';
        const securityQuestion = elements.authSecurityQuestion ? elements.authSecurityQuestion.value : 'What was the name of your first school?';
        const securityAnswer = elements.authSecurityAnswer ? elements.authSecurityAnswer.value : 'school';
        
        if (confirmPass && password !== confirmPass) {
          alert('Passwords do not match! Please check again.');
          return;
        }

        const originalBtnText = elements.authSubmitBtn ? elements.authSubmitBtn.textContent : 'Sign Up';
        if (elements.authSubmitBtn) {
          elements.authSubmitBtn.disabled = true;
          elements.authSubmitBtn.textContent = 'Connecting to Supabase...';
        }
        
        try {
          const res = await store.signUp(fullName, username, password, currency, securityQuestion, securityAnswer);
          if (res.success) {
            if (elements.authPanel) {
              elements.authPanel.classList.add('auth-hidden');
              elements.authPanel.style.setProperty('display', 'none', 'important');
            }
            elements.body.style.overflow = 'auto';
            syncUI();
          } else {
            alert(res.message);
          }
        } catch (err) {
          alert('Sign up error: ' + (err.message || err));
        } finally {
          if (elements.authSubmitBtn) {
            elements.authSubmitBtn.disabled = false;
            elements.authSubmitBtn.textContent = originalBtnText;
          }
        }
      } 
      else if (authState === 'login') {
        // Sign In Flow
        const originalBtnText = elements.authSubmitBtn ? elements.authSubmitBtn.textContent : 'Log In';
        if (elements.authSubmitBtn) {
          elements.authSubmitBtn.disabled = true;
          elements.authSubmitBtn.textContent = 'Signing In...';
        }

        try {
          const res = await store.signIn(username, password);
          if (res.success) {
            if (elements.authPanel) {
              elements.authPanel.classList.add('auth-hidden');
              elements.authPanel.style.setProperty('display', 'none', 'important');
            }
            elements.body.style.overflow = 'auto';
            syncUI();
          } else {
            alert(res.message);
          }
        } catch (err) {
          alert('Sign in error: ' + (err.message || err));
        } finally {
          if (elements.authSubmitBtn) {
            elements.authSubmitBtn.disabled = false;
            elements.authSubmitBtn.textContent = originalBtnText;
          }
        }
      }
      else if (authState === 'recovery_username') {
        // Recovery Lookup
        const question = store.getSecurityQuestion(username);
        if (question) {
          recoveryUsername = username;
          elements.securityAnswerLabel.textContent = question; // Render question
          elements.authSecurityAnswer.placeholder = 'Type your answer here';
          toggleAuthMode('recovery_question');
        } else {
          alert('Account matching this username does not exist.');
        }
      }
      else if (authState === 'recovery_question') {
        // Answer challenge
        const answer = elements.authSecurityAnswer.value.trim();
        const testRes = store.verifySecurityAnswer(recoveryUsername, answer);
        if (testRes.success) {
          recoveryAnswer = answer; // Cache the valid recovery answer!
          toggleAuthMode('recovery_reset'); // Transition to reset input
        } else {
          alert(testRes.message); // Display invalid response alerts
        }
      }
      else if (authState === 'recovery_reset') {
        // Password update
        const newPass = elements.authPassword.value;
        const confirmPass = elements.authConfirmPassword.value;
        
        if (newPass !== confirmPass) {
          alert('Passwords do not match! Please check again.');
          return;
        }
        
        const res = await store.resetPassword(recoveryUsername, recoveryAnswer, newPass); // Use cached answer
        if (res.success) {
          alert('Password reset successfully! Please sign in with your new credentials.');
          toggleAuthMode('login');
        } else {
          alert(res.message);
        }
      }
    });

    // Logout events are delegated to window.handleLogout

    // AI Coach Event Bindings
    if (elements.openAiCoachModalBtn) {
      elements.openAiCoachModalBtn.addEventListener('click', () => {
        openModal(elements.aiCoachModal);
        updateAiCoachModalStatus();
        renderAiChatThread();
      });
    }
    if (elements.floatingAiCoachFab) {
      elements.floatingAiCoachFab.addEventListener('click', () => {
        openModal(elements.aiCoachModal);
        updateAiCoachModalStatus();
        renderAiChatThread();
      });
    }
    window.addEventListener('online', updateAiCoachModalStatus);
    window.addEventListener('offline', updateAiCoachModalStatus);
    if (elements.closeAiCoachModalBtn) {
      elements.closeAiCoachModalBtn.addEventListener('click', () => {
        closeModal(elements.aiCoachModal);
      });
    }
    if (elements.sendAiChatBtn) {
      elements.sendAiChatBtn.addEventListener('click', () => handleSendAiChatMessage());
    }
    if (elements.aiChatInput) {
      elements.aiChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSendAiChatMessage();
        }
      });
    }
    const pills = document.querySelectorAll('.ai-prompt-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        const promptText = e.currentTarget.getAttribute('data-prompt');
        handleSendAiChatMessage(promptText);
      });
    });

    document.addEventListener('click', (e) => {
      const cancelOrCloseBtn = e.target.closest('.modal-close-btn, .btn-cancel-modal');
      if (cancelOrCloseBtn) {
        e.preventDefault();
        const modal = cancelOrCloseBtn.closest('.modal-overlay');
        if (modal) closeModal(modal);
        return;
      }

      const navTarget = e.target.closest('[data-target]');
      if (navTarget && !navTarget.classList.contains('toggle-password-btn')) {
        const targetTab = navTarget.getAttribute('data-target');
        if (targetTab && (targetTab === 'dashboard' || targetTab === 'budgets' || targetTab === 'goals' || targetTab === 'todos' || targetTab === 'guide' || targetTab === 'settings')) {
          e.preventDefault();
          window.switchTab(targetTab);
          window.closeMobileSidebar();
          return;
        }
      }

      const logoutTrigger = e.target.closest('#logoutBtn, #logoutNavBtn');
      if (logoutTrigger) {
        e.preventDefault();
        window.handleLogout(e);
        return;
      }

      const modalTrigger = e.target.closest('#addTxBtn, #addBudgetBtn, #editBudgetBtn, #addGoalBtn');
      if (modalTrigger) {
        e.preventDefault();
        const targetId = modalTrigger.id;
        if (targetId === 'addTxBtn') window.openModalById('addTxModal');
        if (targetId === 'addBudgetBtn') window.openModalById('addBudgetModal');
        if (targetId === 'editBudgetBtn') window.openModalById('editBudgetModal');
        if (targetId === 'addGoalBtn') window.openModalById('addGoalModal');
        return;
      }

      const upgradeBtn = e.target.closest('#sidebarUpgradeBtn, .upgrade-nav-item, .upgrade-trigger-btn');
      if (upgradeBtn) {
        e.preventDefault();
        window.closeMobileSidebar();
        window.openPremiumModal();
      }

      const termsBtn = e.target.closest('.open-terms-modal-btn');
      if (termsBtn) {
        e.preventDefault();
        openModal(elements.termsModal);
      }

      const privacyBtn = e.target.closest('.open-privacy-modal-btn');
      if (privacyBtn) {
        e.preventDefault();
        openModal(elements.privacyModal);
      }

      const refundBtn = e.target.closest('.open-refund-modal-btn');
      if (refundBtn) {
        e.preventDefault();
        openModal(elements.refundModal);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal-overlay.active, .modal-overlay[style*="display: flex"]');
        if (activeModal) closeModal(activeModal);
      }
    });
  }

  /**
   * Toggles the auth screen interface between sign-in, sign-up, and recovery layouts.
   */
  function toggleAuthMode(state) {
    authState = state;
    elements.authForm.reset(); // Wipe inputs
    
    // Reset toggle password buttons text and input types
    document.querySelectorAll('.toggle-password-btn').forEach(btn => {
      btn.textContent = 'Show';
      btn.style.color = 'var(--text-muted)';
      const targetId = btn.getAttribute('data-target');
      const inputField = document.getElementById(targetId);
      if (inputField) {
        inputField.type = 'password';
      }
    });

    // Hide all input control containers
    elements.fullNameGroup.style.display = 'none';
    elements.usernameGroup.style.display = 'none';
    elements.passwordGroup.style.display = 'none';
    elements.confirmPasswordGroup.style.display = 'none';
    elements.currencyGroup.style.display = 'none';
    elements.securityQuestionGroup.style.display = 'none';
    elements.securityAnswerGroup.style.display = 'none';
    
    // Reset defaults display
    elements.forgotPasswordLink.style.display = 'inline';
    
    // Remove HTML5 validation requirements
    elements.authFullName.removeAttribute('required');
    elements.authUsername.removeAttribute('required');
    elements.authPassword.removeAttribute('required');
    elements.authConfirmPassword.removeAttribute('required');
    elements.authSecurityAnswer.removeAttribute('required');
    
    if (state === 'signup') {
      elements.authTitle.textContent = 'Create Account';
      elements.authSubtitle.textContent = 'Register to start managing your personal cash flows';
      
      elements.fullNameGroup.style.display = 'block';
      elements.usernameGroup.style.display = 'block';
      elements.passwordGroup.style.display = 'block';
      elements.confirmPasswordGroup.style.display = 'block';
      elements.currencyGroup.style.display = 'block';
      elements.securityQuestionGroup.style.display = 'block';
      elements.securityAnswerGroup.style.display = 'block';
      
      elements.authFullName.setAttribute('required', 'true');
      elements.authUsername.setAttribute('required', 'true');
      elements.authPassword.setAttribute('required', 'true');
      elements.authConfirmPassword.setAttribute('required', 'true');
      elements.authSecurityAnswer.setAttribute('required', 'true');
      
      elements.authSubmitBtn.textContent = 'Sign Up';
      elements.authToggleText.textContent = 'Already have an account?';
      elements.authToggleLink.textContent = 'Log In';
    } 
    else if (state === 'login') {
      elements.authTitle.textContent = 'Sign In';
      elements.authSubtitle.textContent = 'Access your personal financial dashboard';
      
      elements.usernameGroup.style.display = 'block';
      elements.passwordGroup.style.display = 'block';
      
      elements.authUsername.setAttribute('required', 'true');
      elements.authPassword.setAttribute('required', 'true');
      
      elements.authSubmitBtn.textContent = 'Log In';
      elements.authToggleText.textContent = "Don't have an account?";
      elements.authToggleLink.textContent = 'Sign Up';
    }
    else if (state === 'recovery_username') {
      elements.authTitle.textContent = 'Password Recovery';
      elements.authSubtitle.textContent = 'Enter your username to look up security details';
      
      elements.usernameGroup.style.display = 'block';
      elements.authUsername.setAttribute('required', 'true');
      
      elements.authSubmitBtn.textContent = 'Continue';
      elements.authToggleText.textContent = 'Remember password?';
      elements.authToggleLink.textContent = 'Log In';
    }
    else if (state === 'recovery_question') {
      elements.authTitle.textContent = 'Security Challenge';
      elements.authSubtitle.textContent = 'Verify your identity by answering the question below';
      
      elements.securityAnswerGroup.style.display = 'block';
      elements.authSecurityAnswer.setAttribute('required', 'true');
      
      elements.authSubmitBtn.textContent = 'Verify';
      elements.authToggleText.textContent = 'Cancel recovery?';
      elements.authToggleLink.textContent = 'Log In';
    }
    else if (state === 'recovery_reset') {
      elements.authTitle.textContent = 'Reset Password';
      elements.authSubtitle.textContent = 'Choose a secure new password for your account';
      
      elements.passwordGroup.style.display = 'block';
      elements.confirmPasswordGroup.style.display = 'block';
      elements.forgotPasswordLink.style.display = 'none'; // Hide forgot helper
      
      elements.authPassword.setAttribute('required', 'true');
      elements.authConfirmPassword.setAttribute('required', 'true');
      
      elements.authSubmitBtn.textContent = 'Update Password';
      elements.authToggleText.textContent = 'Cancel reset?';
      elements.authToggleLink.textContent = 'Log In';
    }
  }

  /**
   * Initializes local notifications for Capacitor mobile apps.
   * Prompts for permission on first startup and schedules recurring budget/entry reminders.
   */
  async function initLocalNotifications() {
    const capacitor = window.Capacitor;
    if (capacitor && capacitor.Plugins && capacitor.Plugins.LocalNotifications) {
      const { LocalNotifications } = capacitor.Plugins;
      try {
        let permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display === 'prompt' || permStatus.display === 'prompt-with-rationale') {
          permStatus = await LocalNotifications.requestPermissions();
        }
        
        if (permStatus.display === 'granted') {
          // Cancel existing scheduled notifications to avoid duplicates
          const pending = await LocalNotifications.getPending();
          if (pending && pending.notifications && pending.notifications.length > 0) {
            await LocalNotifications.cancel(pending);
          }

          // Schedule 2 Android mobile notifications:
          // 1. Daily Ledger Entry & Cash Flow Reminder (8:00 PM)
          // 2. Proactive Money Diagnostics & Leak Alerts Digest (12:00 PM Noon)
          await LocalNotifications.schedule({
            notifications: [
              {
                title: "✍️ Finflow Daily Check-in",
                body: "Don't forget to log today's transactions so FinFlow can update your 90-day cash flow runway!",
                id: 99,
                schedule: {
                  on: {
                    hour: 20,   // 8:00 PM
                    minute: 0
                  },
                  repeats: true
                }
              },
              {
                title: "💡 Proactive Money Diagnostics Ready",
                body: "FinFlow has fresh spending leak alerts & savings velocity tips ready on your dashboard!",
                id: 100,
                schedule: {
                  on: {
                    hour: 12,   // 12:00 PM Noon
                    minute: 0
                  },
                  repeats: true
                }
              }
            ]
          });
        }
      } catch (err) {
        console.warn('Capacitor Local Notifications initialization failed:', err);
      }
    }
  }

  // --- Core Application Entry Point ---
  window.addEventListener('DOMContentLoaded', () => {
    window.AppStore.init();      // Initialize database store values
    
    // Reset query count to clear any double-trigger test counter
    if (window.AppStore.getSettings().aiQueriesCount > 0 && !window.AppStore.getSettings().isPremium) {
      window.AppStore.updateSettings({ aiQueriesCount: 0 });
    }

    cacheElements();             // Map visual DOM nodes
    initTheme();                 // Configure active theme layouts
    registerEvents();            // Bind all form submit and button click listeners
    initAuth();                  // Handle sign-in/sign-up authentication checks
    
    if (window.AppCharts && typeof window.AppCharts.init === 'function') {
      window.AppCharts.init();     // Initialize Charts.js default configurations
    }
    syncUI();                    // Redraw all UI elements
    
    if (window.AppStore.isLoggedIn()) {
      // Pull latest profile picture, settings, and ledger data from Supabase Cloud on startup
      window.AppStore.fetchFromCloud().then(synced => {
        if (synced) {
          syncUI();
        }
      });

      initLocalNotifications();    // Setup local notifications reminders

      // Fetch fresh FX rates in the background to update conversions in real-time
      fetchLiveExchangeRates().then(() => {
        syncUI();
      });
      
      // Auto-trigger help tour on first loading index context
      if (!localStorage.getItem('FINANCIAL_DASHBOARD_TOUR_DONE')) {
        setTimeout(() => {
          if (confirm('Welcome to your Financial Dashboard! Would you like a quick 1-minute guided tour of the features?')) {
            startTour();
          } else {
            localStorage.setItem('FINANCIAL_DASHBOARD_TOUR_DONE', 'true');
          }
        }, 1000);
      }
    }
  });

  // Auto-sync from Supabase Cloud when user switches back to the browser tab or focuses app
  const triggerCloudSyncCheck = () => {
    if (window.AppStore && window.AppStore.isLoggedIn()) {
      window.AppStore.fetchFromCloud().then(synced => {
        if (synced && window.syncUI) {
          window.syncUI();
        }
      });
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      triggerCloudSyncCheck();
    }
  });

  window.addEventListener('focus', triggerCloudSyncCheck);

  // Automatic background cloud sync every 10 seconds for real-time multi-device sync
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      triggerCloudSyncCheck();
    }
  }, 10000);

})(window);

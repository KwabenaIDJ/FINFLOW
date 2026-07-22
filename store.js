/**
 * Financial Dashboard Store
 * Handles LocalStorage persistence, data mutation, mock data seeding,
 * and multi-user authentication & session management.
 */

(function (window) {
  // Enforce strict JavaScript mode to catch common coding mistakes
  'use strict';

  // The local storage key used to persist the active dashboard data session
  const STORAGE_KEY = 'FINANCIAL_DASHBOARD_DATA_CLEAN';
  // The local storage key used to persist the multi-user credentials and data database
  const USERS_REGISTRY_KEY = 'FINANCIAL_DASHBOARD_USERS';
  // The local storage key used to track the currently logged-in user session
  const SESSION_KEY = 'CURRENT_USER_SESSION';

  const DEFAULT_GHS_RATES = {
    'GH₵': 1.0,
    '$': 11.59,
    '€': 12.60,
    '£': 14.80,
    '¥': 2.15,
    '₹': 0.19,
    'C$': 11.30,
    'A$': 10.30,
    'Fr': 17.50,
    'kr': 1.45,
    'zł': 3.90,
    'R$': 2.80,
    '₽': 0.17,
    'R': 0.85,
    'د.إ': 4.22,
    'ر.س': 4.13,
    '₪': 4.20,
    '₱': 0.27,
    'Rp': 0.0010,
    'RM': 3.30,
    '฿': 0.43,
    '₫': 0.00061,
    '₦': 0.010,
    'KSh': 0.12
  };

  /**
   * Generates default structural seed data if no data exists in localStorage.
   * This sets up initial budgets, empty lists of transactions and goals, and default settings.
   */
  function getSeedData() {
    // Reference the current date/time
    const today = new Date();
    // Helper function to generate clean string dates offset by a number of days
    const generateDate = (offsetDays) => {
      const d = new Date(today);
      d.setDate(today.getDate() - offsetDays);
      return d.toISOString().split('T')[0]; // Extract YYYY-MM-DD
    };

    // Return the default data blueprint
    return {
      transactions: [], // Initialize transactions ledger as an empty array
      budgets: {
        Rent: 1400,        // Default category monthly limits
        Food: 550,
        Utilities: 250,
        Shopping: 350,
        Entertainment: 200,
        Travel: 300,
        Other: 150
      },
      goals: [],      // Starts with a clean goals list per user request
      portfolio: [],  // Initialize investments portfolio as an empty array
      todos: [],      // Tasks checklist
      settings: {
        userName: 'User',     // Initial user profile display name
        currency: 'GH₵',       // Initial currency symbol
        monthlySavingsGoal: 1200, // Monthly savings target
        paystackKey: '',       // Empty Paystack secret key placeholder
        isPremium: false,      // Default membership tier (Standard)
        exchangeRates: {...DEFAULT_GHS_RATES}
      }
    };
  }

  // The central database store object exposed to the window context
  const AppStore = {
    data: null,      // Holds the active parsed database object in memory
    undoStack: [],   // History stack of serialized states for the Undo operation
    redoStack: [],   // History stack of serialized states for the Redo operation

    /**
     * Initializes the store by loading persisted data from the browser's localStorage.
     * Checks if a user is logged in. If yes, loads user profile data. If no, prepares seeder data.
     */
    init() {
      this.undoStack = []; // Initialize empty stack for undo history tracking
      this.redoStack = []; // Initialize empty stack for redo history tracking
      
      const currentUser = localStorage.getItem(SESSION_KEY);
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');

      if (currentUser && registry[currentUser]) {
        // Load the logged-in user's private data object
        this.data = registry[currentUser].data;
        
        // Safety check to ensure data structures are healthy
        if (!this.data || !this.data.settings) {
          this.data = getSeedData();
          this.save();
        }
      } else {
        // No active session: fallback to default mock seeder data so components don't crash
        this.data = getSeedData();
      }
    },

    /**
     * Checks if a user is currently logged in.
     */
    isLoggedIn() {
      return localStorage.getItem(SESSION_KEY) !== null;
    },

    /**
     * Authenticates a user and sets up the active session.
     */
    signIn(username, password) {
      const userKey = username.trim().toLowerCase();
      // Load user accounts registry
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');

      if (!registry[userKey]) {
        return { success: false, message: 'Account not found. Please sign up first!' };
      }

      if (registry[userKey].password !== password) {
        return { success: false, message: 'Invalid password. Please try again.' };
      }

      // Establish session
      localStorage.setItem(SESSION_KEY, userKey);
      this.data = registry[userKey].data;
      
      // Save current active state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      window.dispatchEvent(new CustomEvent('store-updated'));
      
      return { success: true };
    },

    /**
     * Registers a new user profile with clean workspace seed values and recovery questions.
     */
    signUp(fullName, username, password, currency, securityQuestion, securityAnswer) {
      const userKey = username.trim().toLowerCase();
      if (!userKey || !password || !fullName.trim() || !securityAnswer.trim()) {
        return { success: false, message: 'Please fill in all details, including the recovery security answer.' };
      }

      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');

      if (registry[userKey]) {
        return { success: false, message: 'Username is already taken. Try another!' };
      }

      // Seed a clean blueprint for the new user
      const userData = getSeedData();
      userData.settings.userName = fullName.trim();
      userData.settings.currency = currency;

      // Add to accounts database with recovery questions
      registry[userKey] = {
        password: password,
        securityQuestion: securityQuestion,
        securityAnswer: securityAnswer.trim().toLowerCase(), // Normalized case insensitive answer
        data: userData
      };

      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
      
      // Automatically log the user in
      localStorage.setItem(SESSION_KEY, userKey);
      this.data = userData;
      
      // Save active session data
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      window.dispatchEvent(new CustomEvent('store-updated'));

      return { success: true };
    },

    /**
     * Looks up a user's recovery security question based on their username.
     */
    getSecurityQuestion(username) {
      const userKey = username.trim().toLowerCase();
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      if (registry[userKey]) {
        return registry[userKey].securityQuestion || 'What was the name of your first school?';
      }
      return null;
    },

    /**
     * Checks answer and resets password if verified.
     */
    resetPassword(username, answer, newPassword) {
      const userKey = username.trim().toLowerCase();
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      if (!registry[userKey]) {
        return { success: false, message: 'Username not found in registry.' };
      }

      const storedAnswer = registry[userKey].securityAnswer || '';
      if (storedAnswer.toLowerCase() !== answer.trim().toLowerCase()) {
        return { success: false, message: 'Incorrect security answer! Reset failed.' };
      }

      // Apply new password
      registry[userKey].password = newPassword;
      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
      return { success: true };
    },

    /**
     * Seeds and authenticates an interactive Demo user account populated with rich sample data.
     */
    signInDemo() {
      const demoKey = 'demo_user';
      const today = new Date();
      const formatIsoDate = (offsetDays) => {
        const d = new Date(today);
        d.setDate(today.getDate() - offsetDays);
        return d.toISOString().split('T')[0];
      };

      const demoData = {
        transactions: [
          { id: 'tx-demo-1', type: 'income', category: 'Salary', amount: 4800.00, date: formatIsoDate(1), description: 'Monthly Tech Salary Deposit', destination: 'Bank Account' },
          { id: 'tx-demo-2', type: 'income', category: 'Investments', amount: 950.00, date: formatIsoDate(3), description: 'Quarterly Stock Dividend Yield', destination: 'Achieve App' },
          { id: 'tx-demo-3', type: 'expense', category: 'Food', amount: 620.00, date: formatIsoDate(2), description: 'Monthly Supermarket & Grocery Stockup', destination: 'Credit Card' },
          { id: 'tx-demo-4', type: 'expense', category: 'Utilities', amount: 280.00, date: formatIsoDate(4), description: 'High-speed Fiber Internet & Power Bill', destination: 'Bank Account' },
          { id: 'tx-demo-5', type: 'expense', category: 'Shopping', amount: 390.00, date: formatIsoDate(5), description: 'Ergonomic Desk Accessories & Chair', destination: 'Credit Card' },
          { id: 'tx-demo-6', type: 'expense', category: 'Entertainment', amount: 160.00, date: formatIsoDate(7), description: 'Concert Tickets & Streaming Subscriptions', destination: 'Mobile Money' },
          { id: 'tx-demo-7', type: 'income', category: 'Freelance', amount: 1200.00, date: formatIsoDate(10), description: 'Web Development Client Retainer', destination: 'Mobile Money' }
        ],
        budgets: {
          Rent: 1400,
          Food: 550,       // 620 spent breaches 550 budget limit (112.7%)
          Utilities: 250,  // 280 spent breaches 250 budget limit (112%)
          Shopping: 350,   // 390 spent breaches 350 budget limit (111%)
          Entertainment: 200,
          Travel: 300,
          Other: 150
        },
        goals: [
          { id: 'g-demo-1', name: 'Emergency Cushion Fund', targetAmount: 5000, currentAmount: 3750, targetDate: formatIsoDate(-120), destination: 'Achieve App' },
          { id: 'g-demo-2', name: 'MacBook Pro Upgrade', targetAmount: 2400, currentAmount: 1800, targetDate: formatIsoDate(-60), destination: 'Fido App' }
        ],
        portfolio: [
          { id: 'p-demo-1', symbol: 'AAPL', name: 'Apple Inc.', shares: 15, buyPrice: 175.50, currentPrice: 224.30 },
          { id: 'p-demo-2', symbol: 'NVDA', name: 'NVIDIA Corp.', shares: 25, buyPrice: 92.00, currentPrice: 128.50 }
        ],
        todos: [
          { id: 't-demo-1', text: 'Review quarterly tax report export', completed: true },
          { id: 't-demo-2', text: 'Rebalance stock portfolio dividends', completed: false }
        ],
        settings: {
          userName: 'Demo Account',
          currency: 'GH₵',
          monthlySavingsGoal: 1500,
          paystackKey: 'pk_test_demo12345',
          isPremium: false,
          exchangeRates: {...DEFAULT_GHS_RATES}
        }
      };

      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      registry[demoKey] = {
        fullName: 'Demo Account',
        username: 'demo_user',
        password: 'demopassword',
        currency: 'GH₵',
        securityQuestion: 'What is your mother\'s maiden name?',
        securityAnswer: 'demo',
        data: demoData
      };

      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
      localStorage.setItem(SESSION_KEY, demoKey);
      this.data = demoData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      window.dispatchEvent(new CustomEvent('store-updated'));

      return { success: true };
    },

    /**
     * Global instant click handler for Live Demo buttons.
     */
    handleLiveDemoClick(e) {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
      try {
        this.signInDemo();
      } catch (err) {
        console.error('Demo click error:', err);
        localStorage.setItem('CURRENT_USER_SESSION', 'demo_user');
      }
      
      const authPanel = document.getElementById('authPanel');
      if (authPanel) {
        authPanel.classList.add('auth-hidden');
        authPanel.style.setProperty('display', 'none', 'important');
      }
      document.body.style.overflow = 'auto';

      setTimeout(() => {
        window.location.reload();
      }, 50);
    },

    /**
     * Clears active session credentials and returns user to the login screen.
     */
    logout() {
      const currentUser = localStorage.getItem(SESSION_KEY);
      if (currentUser) {
        const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
        // Persist data of the logging out user to the database registry
        if (registry[currentUser]) {
          registry[currentUser].data = this.data;
          localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
        }
      }
      
      // Wipe session variables
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(STORAGE_KEY);
      
      // Reload page context to force routing back to authOverlay
      window.location.reload();
    },

    /**
     * Serializes and writes the in-memory data object back to localStorage.
     * Dispatches a custom event to notify all listening UI views to redraw.
     */
    save() {
      // Stringify the data object and write it into active local storage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      
      // Sync private registry entry if logged in
      const currentUser = localStorage.getItem(SESSION_KEY);
      if (currentUser) {
        const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
        if (registry[currentUser]) {
          registry[currentUser].data = this.data;
          localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
        }
      }

      // Dispatch a custom event on the window to alert observers that the state has changed
      window.dispatchEvent(new CustomEvent('store-updated'));
      // Synchronize the Undo/Redo button disable/enable states in the header toolbar
      this.updateButtonsUI();
    },

    /**
     * Pushes a serialized copy of the current database state onto the undo stack.
     * Clears the redo stack to ensure linear history progression when a new change occurs.
     */
    pushState() {
      // Serialize a deep copy of the current database state
      const stateCopy = JSON.stringify(this.data);
      // Push state copy onto the undo tracker array
      this.undoStack.push(stateCopy);
      // Cap stack length at 50 snapshots to prevent memory overhead
      if (this.undoStack.length > 50) {
        this.undoStack.shift(); // Evict the oldest history entry
      }
      // Any new modification clears the forward redo history chain
      this.redoStack = [];
      // Synchronize toolbar Undo/Redo visual buttons
      this.updateButtonsUI();
    },

    /**
     * Reverts the database state back by one step using the top of the undo stack.
     */
    undo() {
      // Validate that we have a past state history to return to
      if (this.undoStack.length > 0) {
        // Cache billing & usage trial metadata to prevent undo cheats/exploits
        const isPremiumCached = this.data && this.data.settings ? this.data.settings.isPremium : false;
        const freePdfCached = this.data && this.data.settings ? this.data.settings.freePdfExportsUsed : 0;

        // Serialize the current state and push it onto the redo stack
        const currentState = JSON.stringify(this.data);
        this.redoStack.push(currentState);
        
        // Pop the top state copy off the undo stack
        const previousState = this.undoStack.pop();
        // Parse the retrieved historical state string back into active memory
        this.data = JSON.parse(previousState);

        // Re-apply protected billing configurations
        if (this.data && this.data.settings) {
          this.data.settings.isPremium = isPremiumCached;
          this.data.settings.freePdfExportsUsed = freePdfCached;
        }
        
        // Save state changes
        this.save();
      }
    },

    /**
     * Re-applies the next database state from the redo stack.
     */
    redo() {
      // Validate that we have a forward state history to apply
      if (this.redoStack.length > 0) {
        // Cache billing & usage trial metadata to prevent redo cheats/exploits
        const isPremiumCached = this.data && this.data.settings ? this.data.settings.isPremium : false;
        const freePdfCached = this.data && this.data.settings ? this.data.settings.freePdfExportsUsed : 0;

        // Serialize current state and push it back to the undo stack
        const currentState = JSON.stringify(this.data);
        this.undoStack.push(currentState);
        
        // Pop the top state copy off the redo stack
        const nextState = this.redoStack.pop();
        // Parse the next state back into the active database structure
        this.data = JSON.parse(nextState);

        // Re-apply protected billing configurations
        if (this.data && this.data.settings) {
          this.data.settings.isPremium = isPremiumCached;
          this.data.settings.freePdfExportsUsed = freePdfCached;
        }
        
        // Save database updates
        this.save();
      }
    },

    /**
     * Dynamically updates the visual styling, disabled state, and cursor properties
     * of the header Undo and Redo toolbar buttons.
     */
    updateButtonsUI() {
      // Grab button element nodes from the document tree
      const undoBtn = document.getElementById('undoBtn');
      const redoBtn = document.getElementById('redoBtn');
      
      // If the Undo button is present in the DOM
      if (undoBtn) {
        if (this.undoStack.length > 0) {
          undoBtn.removeAttribute('disabled'); // Allow user clicks
          undoBtn.style.opacity = '1';         // Set full solid opacity
          undoBtn.style.cursor = 'pointer';    // Show pointer arrow hand
        } else {
          undoBtn.setAttribute('disabled', 'true'); // Block browser clicks
          undoBtn.style.opacity = '0.5';             // Make semi-transparent
          undoBtn.style.cursor = 'not-allowed';      // Show cross sign cursor
        }
      }
      
      // If the Redo button is present in the DOM
      if (redoBtn) {
        if (this.redoStack.length > 0) {
          redoBtn.removeAttribute('disabled'); // Allow clicks
          redoBtn.style.opacity = '1';         // Full opacity
          redoBtn.style.cursor = 'pointer';    // Pointer hand cursor
        } else {
          redoBtn.setAttribute('disabled', 'true'); // Block clicks
          redoBtn.style.opacity = '0.5';             // Semi-transparent
          redoBtn.style.cursor = 'not-allowed';      // Not allowed cursor
        }
      }
    },

    // --- Transactions API ---

    /**
     * Returns the array containing all recorded transactions in the ledger database.
     */
    getTransactions() {
      return this.data.transactions;
    },

    /**
     * Records a new transaction entry to the database.
     * Mutates the state and saves it.
     */
    addTransaction(tx) {
      // Record historical state before updating database to support Undo
      this.pushState();
      // Instantiate standard transaction properties mapping values correctly
      const newTx = {
        // Generate unique transaction string ID based on millisecond timestamp and random offset
        id: 'tx-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        type: tx.type, // 'income' or 'expense'
        category: tx.category,
        amount: Number(tx.amount), // Force numeric type
        date: tx.date || new Date().toISOString().split('T')[0], // Default to current date string
        description: tx.description || '' // Default empty string
      };
      
      // Insert new transaction to front of ledger array
      this.data.transactions.unshift(newTx);
      // Sort the transactions ledger in descending YYYY-MM-DD date order
      this.data.transactions.sort((a, b) => b.date.localeCompare(a.date));
      // Save data mutations and trigger updates
      this.save();
      return newTx; // Return the newly recorded transaction object reference
    },

    /**
     * Deletes a transaction from the ledger using its unique string ID.
     */
    deleteTransaction(id) {
      // Save snapshot for Undo
      this.pushState();
      // Locate index position of transaction matching ID
      const index = this.data.transactions.findIndex(t => t.id === id);
      if (index !== -1) {
        // Remove item from transactions array
        this.data.transactions.splice(index, 1);
        // Persist update state
        this.save();
        return true; // Return successful status
      }
      return false; // Transaction matching ID not found
    },

    // --- Budgets API ---

    /**
     * Returns the categories limits budget map object.
     */
    getBudgets() {
      return this.data.budgets;
    },

    /**
     * Modifies the monthly cap limit of a specific budget category.
     */
    updateBudget(category, amount) {
      // Save state snapshot for Undo
      this.pushState();
      // Update or create budget entry category map limit
      this.data.budgets[category] = Number(amount);
      // Persist values to localStorage
      this.save();
    },

    /**
     * Removes a category budget limit completely.
     */
    deleteBudget(category) {
      // Save state snapshot for Undo
      this.pushState();
      // Delete budget category key from map
      delete this.data.budgets[category];
      // Persist values to localStorage
      this.save();
    },

    // --- Savings Goals API ---

    /**
     * Returns the array containing all active savings goals.
     */
    getGoals() {
      return this.data.goals;
    },

    /**
     * Adds a new savings goal target configuration to the database.
     */
    addGoal(goal) {
      // Save state copy for Undo
      this.pushState();
      // Construct savings goals blueprint mapping properties correctly
      const newGoal = {
        // Instantiate goal ID string using timestamp prefix
        id: 'goal-' + Date.now(),
        name: goal.name,
        targetAmount: Number(goal.targetAmount),
        currentAmount: Number(goal.currentAmount || 0),
        // Default target date to 30 days ahead if left empty
        targetDate: goal.targetDate || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
        destination: goal.destination || 'Mobile Money (MoMo) Wallet' // Saved destination name
      };
      
      // Append goal item into list
      this.data.goals.push(newGoal);
      // Persist state updates
      this.save();
      return newGoal;
    },

    /**
     * Deposits or withdraws funds from a specific savings goal item.
     */
    updateGoalAmount(id, changeAmount) {
      // Save state copy for Undo
      this.pushState();
      // Find goal item matching input ID
      const goal = this.data.goals.find(g => g.id === id);
      if (goal) {
        // Modify goal currentAmount preventing it from falling below zero
        goal.currentAmount = Math.max(0, goal.currentAmount + Number(changeAmount));
        // Save updates to storage
        this.save();
        return true; // Update success
      }
      return false; // Goal not found
    },

    /**
     * Deletes a savings goal from the tracker.
     */
    deleteGoal(id) {
      // Save snapshot for Undo
      this.pushState();
      // Locate index position of goal matching ID
      const index = this.data.goals.findIndex(g => g.id === id);
      if (index !== -1) {
        // Remove item from goal array
        this.data.goals.splice(index, 1);
        // Save updates
        this.save();
        return true; // Goal delete success
      }
      return false; // Goal not found
    },

    // --- Portfolio API ---

    /**
     * Returns the array containing investment items.
     */
    getPortfolio() {
      return this.data.portfolio;
    },

    /**
     * Updates an asset's current price in memory without dispatching event storms.
     */
    updateAssetPrice(symbol, newPrice) {
      const asset = this.data.portfolio.find(a => a.symbol === symbol);
      if (asset) {
        asset.currentPrice = Number(newPrice);
        // Persist updates to storage silently to avoid performance bottlenecks
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      }
    },

    // --- Settings API ---

    /**
     * Returns the settings configuration object from memory.
     */
    getSettings() {
      return this.data.settings;
    },

    /**
     * Updates the user profile settings (name, currency, savings goal).
     */
    updateSettings(newSettings) {
      // Save state snapshot for Undo
      this.pushState();
      // Merge current setting parameters with the incoming properties
      this.data.settings = { ...this.data.settings, ...newSettings };
      // Save settings changes
      this.save();
    },

    /**
     * Toggles user premium status.
     */
    setPremiumStatus(isPremium) {
      // Save state snapshot for Undo
      this.pushState();
      this.data.settings.isPremium = !!isPremium;
      this.save();
    },

    // --- To-Do Task Checklist API ---
    getTodos() {
      if (!this.data.todos) this.data.todos = [];
      return this.data.todos;
    },
    addTodo(text) {
      this.pushState();
      if (!this.data.todos) this.data.todos = [];
      const newTodo = {
        id: 'todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        text: text.trim(),
        completed: false,
        createdAt: new Date().toISOString()
      };
      this.data.todos.push(newTodo);
      this.save();
      return newTodo;
    },
    toggleTodo(todoId) {
      this.pushState();
      if (!this.data.todos) this.data.todos = [];
      const todo = this.data.todos.find(t => t.id === todoId);
      if (todo) {
        todo.completed = !todo.completed;
        this.save();
      }
    },
    deleteTodo(todoId) {
      this.pushState();
      if (!this.data.todos) this.data.todos = [];
      this.data.todos = this.data.todos.filter(t => t.id !== todoId);
      this.save();
    },

    // --- Summaries & Calculations ---

    /**
     * Summarizes transactions to determine net worth and cash balances.
     */
    getBalance() {
      let balance = 0; // Initialize total net cash tracker
      // Traverse all transactions to calculate aggregate balances
      this.data.transactions.forEach(tx => {
        if (tx.type === 'income') {
          balance += tx.amount; // Inflow adds to balance
        } else {
          balance -= tx.amount; // Outflow deducts from balance
        }
      });
      
      // Return structural cash summary
      return {
        cash: balance,
        investments: 0,
        total: balance
      };
    },

    /**
     * Returns the total current valuation of portfolio assets.
     */
    getPortfolioValue() {
      // Accumulate valuation using: shares count * stock current unit price
      return this.data.portfolio.reduce((sum, asset) => sum + (asset.shares * asset.currentPrice), 0);
    },

    /**
     * Aggregates total income, expenses, and category sums for a specific month and year.
     */
    getMonthlyTotals(year, month) {
      let income = 0; // Inflow accumulator
      let expenses = 0; // Outflow accumulator
      const categoryBreakdown = {}; // Object matching categories to spend sums

      // Traverse all transactions to calculate specific month aggregates
      this.data.transactions.forEach(tx => {
        if (tx.date) {
          const parts = tx.date.split('-');
          const txYear = parseInt(parts[0], 10);
          const txMonth = parseInt(parts[1], 10) - 1; // Align to JavaScript 0-indexed months
          
          // Verify if transaction timestamp matches the requested year and month
          if (txYear === year && txMonth === month) {
            if (tx.type === 'income') {
              income += tx.amount; // Add to income sum
            } else {
              expenses += tx.amount; // Add to expense sum
              // Add category aggregate spent
              categoryBreakdown[tx.category] = (categoryBreakdown[tx.category] || 0) + tx.amount;
            }
          }
        }
      });

      return { income, expenses, categoryBreakdown };
    },

    /**
     * Builds flow trends for charts by analyzing the last N months.
     */
    getHistoricalMonthlyFlow(monthsCount = 6) {
      const result = []; // Array containing historical flow data points
      const today = new Date(); // Active datetime anchor

      // Iterate backwards starting from oldest month to newest
      for (let i = monthsCount - 1; i >= 0; i--) {
        // Calculate dynamic year and month offsets
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        // Fetch category breakdown calculations
        const totals = this.getMonthlyTotals(year, month);
        // Build readable date labels like "Oct 26"
        const monthLabel = d.toLocaleString('default', { month: 'short' }) + ' ' + String(year).slice(-2);

        // Push standard trend data coordinates
        result.push({
          label: monthLabel,
          income: totals.income,
          expenses: totals.expenses,
          year,
          month
        });
      }
      return result;
    },

    // --- CSV Utilities ---

    /**
     * Converts transactions ledger array into a downloadable CSV string.
     */
    exportToCSV() {
      // Define column headings
      const headers = ['ID', 'Type', 'Category', 'Amount', 'Date', 'Description'];
      // Map transaction properties into matching row arrays
      const rows = this.data.transactions.map(tx => [
        tx.id,
        tx.type,
        tx.category,
        tx.amount,
        tx.date,
        `"${tx.description.replace(/"/g, '""')}"` // Escape inner quotes
      ]);

      // Combine column headings with transaction rows using line returns
      const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      return csvContent; // Return finalized CSV spreadsheet text block
    },

    /**
     * Parses a CSV string and imports transaction records.
     */
    importFromCSV(csvText) {
      // Split CSV into individual lines
      const lines = csvText.split('\n');
      if (lines.length < 2) return false; // Verify that file has rows

      const newTxList = []; // Holds valid parsed transactions
      const firstLine = lines[0].toLowerCase(); // Fetch header label line
      let startIdx = 1; // Default to index 1 (assumes headers exist)
      
      // If header is missing columns, set start parsing row at index 0
      if (!firstLine.includes('type') && !firstLine.includes('amount')) {
        startIdx = 0;
      }

      // Traverse parsing lines of CSV text block
      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip blank returns

        // Regex split on commas ignoring commas nested inside escaped quotation marks
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
        if (matches.length < 4) continue; // Skip invalid columns

        let type, category, amount, date, description;

        // Parse matching index positions based on CSV row structures
        if (matches.length >= 6) {
          type = matches[1].replace(/"/g, '').trim().toLowerCase();
          category = matches[2].replace(/"/g, '').trim();
          amount = parseFloat(matches[3]);
          date = matches[4].replace(/"/g, '').trim();
          description = matches[5] ? matches[5].replace(/^"|"$/g, '').replace(/""/g, '"').trim() : '';
        } else {
          type = matches[0].replace(/"/g, '').trim().toLowerCase();
          category = matches[1].replace(/"/g, '').trim();
          amount = parseFloat(matches[2]);
          date = matches[3].replace(/"/g, '').trim();
          description = matches[4] ? matches[4].replace(/^"|"$/g, '').replace(/""/g, '"').trim() : '';
        }

        // Validate transaction parameters before pushing record to temporary list
        if ((type === 'income' || type === 'expense') && !isNaN(amount) && date) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            newTxList.push({
              id: 'tx-imported-' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '-' + i,
              type,
              category,
              amount,
              date,
              description
            });
          }
        }
      }

      // If valid transaction records are parsed successfully
      if (newTxList.length > 0) {
        // Prepend imported lists to the current ledger database
        this.data.transactions = [...newTxList, ...this.data.transactions];
        // Sort ledger in descending date order
        this.data.transactions.sort((a, b) => b.date.localeCompare(a.date));
        // Persist results and notify components
        this.save();
        return newTxList.length; // Return number of parsed transactions
      }
      return 0; // Return empty status
    }
  };

  // Attach AppStore and global demo handler to the window container
  window.AppStore = AppStore;
  window.handleLiveDemoClick = function(e) {
    AppStore.handleLiveDemoClick(e);
  };
})(window);

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

  // Hardcoded Supabase Credentials
  const HARDCODED_SUPABASE_URL = "https://smyfhrjtljujwxjuucxe.supabase.co";
  const HARDCODED_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNteWZocmp0bGp1and4anV1Y3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTIzNDksImV4cCI6MjEwMDY2ODM0OX0.xn_wIIzxSb6ut4WNRcjFtTf0Jf3XSXIbjQLBAvIqb9w";

  let supabaseClient = null;

  function getSupabaseClient() {
    if (!supabaseClient && window.supabase && HARDCODED_SUPABASE_URL && HARDCODED_SUPABASE_ANON_KEY) {
      try {
        supabaseClient = window.supabase.createClient(HARDCODED_SUPABASE_URL, HARDCODED_SUPABASE_ANON_KEY);
      } catch (err) {
        console.warn('Supabase client initialization error:', err);
      }
    }
    return supabaseClient;
  }

  let realtimeChannel = null;

  function setupRealtimeSync(userId) {
    const client = getSupabaseClient();
    if (!client || !userId || userId === 'demo_user') return;

    if (realtimeChannel) {
      try { client.removeChannel(realtimeChannel); } catch(e) {}
    }

    // Try block to initialize and subscribe to Supabase Realtime channel
    try {
      // Create or get Supabase Realtime channel for this specific user
      realtimeChannel = client.channel(`realtime-sync-${userId}`)
        // Listen to database events on user transactions, budgets, and savings goals
        .on('postgres_changes', { event: '*', schema: 'public', filter: `user_id=eq.${userId}` }, (payload) => {
          // Check if AppStore and syncFromCloud method exist
          if (window.AppStore && typeof window.AppStore.syncFromCloud === 'function') {
            // Trigger background cloud fetch to pull changes
            window.AppStore.syncFromCloud().then(() => {
              // Refresh user interface if syncUI function is defined
              if (typeof window.syncUI === 'function') window.syncUI();
            // End promise resolution
            });
          // End AppStore check
          }
        // End user_id postgres_changes listener
        })
        // Listen to database events on the profiles table (profile picture, display name, currency)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
          // Verify that change payload belongs to the currently logged in user
          if (payload && payload.new && payload.new.id === userId) {
            // Calculate elapsed time since this specific device last modified the avatar
            const elapsed = Date.now() - (window.AppStore?._lastLocalAvatarUpdate || 0);
            // If another device initiated the change (not locally updated in the last 6 seconds)
            if (elapsed > 6000 && window.AppStore) {
              // Retrieve existing settings object from the store
              const currentSettings = window.AppStore.getSettings();
              // Immediately update profile picture from incoming cloud payload (clearing if empty)
              currentSettings.profilePic = payload.new.profile_pic || '';
              // Update display name if provided in cloud payload
              if (payload.new.user_name) currentSettings.userName = payload.new.user_name;
              // Update currency symbol if provided in cloud payload
              if (payload.new.currency) currentSettings.currency = payload.new.currency;
              // Persist update to local storage without triggering a recursive cloud push
              window.AppStore.saveLocally(true);
              // Immediately refresh user interface on this device
              if (typeof window.syncUI === 'function') window.syncUI();
            // End remote device update block
            }
          // End payload user verification
          }
          // Perform full cloud fetch to ensure ledger state consistency
          if (window.AppStore && typeof window.AppStore.syncFromCloud === 'function') {
            // Await full cloud fetch promise
            window.AppStore.syncFromCloud().then(() => {
              // Refresh user interface
              if (typeof window.syncUI === 'function') window.syncUI();
            // End promise resolution
            });
          // End syncFromCloud check
          }
        // End profiles table postgres_changes listener
        })
        // Subscribe to channel
        .subscribe();
    // Catch any connection or subscription errors
    } catch (e) {}
  }

  const DEFAULT_GHS_RATES = {
    'GH₵': 1.0,
    '$': 15.50,
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
   * Dedicated business income and expense categorization dictionary.
   * Tailored for small enterprises, sole proprietorships, freelancers, and commercial retail.
   */
  const BUSINESS_CATEGORIES = {
    // Commercial revenue and capital inflows
    income: [
      // Direct product sales
      'Product Sales',
      // Paid client invoices
      'Client Invoices',
      // Service, consulting, and client fees
      'Service & Consulting Fees',
      // B2B contracts and project retainers
      'Contracts & Projects',
      // Capital investments, loans, and business grants
      'Capital Investments / Grants',
      // Custom business revenue category option
      'Other'
    // End income categories
    ],
    // Commercial expenditures and operational outflows
    expense: [
      // Cost of Goods Sold / Inventory procurement
      'Inventory / Stock (COGS)',
      // Employee wages and contractor compensation
      'Payroll & Staff Wages',
      // Commercial office, warehouse, or shop rent
      'Workspace / Shop Rent',
      // Power, water, commercial internet, and telephone
      'Utilities & Internet',
      // Digital ads, social promotions, and marketing campaigns
      'Marketing, Ads & Promotions',
      // Shipping, courier, packaging materials, and logistics
      'Packaging & Logistics',
      // Machinery, tools, hardware, and physical equipment
      'Equipment & Hardware',
      // Corporate income taxes, VAT, NHIL, levies, and municipal permits
      'Taxes & Business Levies',
      // Software licenses, hosting, cloud tools, and SaaS
      'Software & Digital Tools',
      // Legal, accounting, bookkeeping, and consulting fees
      'Professional Fees (Legal/Audit)',
      // Miscellaneous office and operational expenses
      'General Operating Expenses',
      // Custom business expenditure category option
      'Other'
    // End expense categories
    ]
  // End BUSINESS_CATEGORIES
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

    return {
      transactions: [], // Initialize transactions ledger as an empty array
      budgets: {},      // Clean empty category monthly limits
      goals: [],        // Clean goals list
      portfolio: [],    // Clean investments portfolio
      todos: [],        // Clean tasks checklist
      debts: [],        // Debts and money lent tracking array
      settings: {
        userName: 'User',        // Initial user profile display name
        currency: 'GH₵',          // Initial currency symbol
        monthlySavingsGoal: 0,   // Monthly savings target
        paystackKey: '',         // Empty Paystack secret key placeholder
        geminiApiKey: '',        // Optional Gemini AI API key override
        aiQueriesCount: 0,       // Free AI Coach queries used counter
        isPremium: false,        // Default membership tier (Standard)
        exchangeRates: {...DEFAULT_GHS_RATES}
      }
    };
  }

  // The central database store object exposed to the window context
  const AppStore = {
    data: null,      // Holds the active parsed database object in memory
    undoStack: [],   // History stack of serialized states for the Undo operation
    redoStack: [],   // History stack of serialized states for the Redo operation
    _lastLocalAvatarUpdate: 0, // Timestamp of the most recent local profile picture change

    /**
     * Initializes the store by loading persisted data from the browser's localStorage.
     * Checks if a user is logged in. If yes, loads user profile data. If no, prepares seeder data.
     */
    init() {
      // Initialize empty stack for undo history tracking
      this.undoStack = [];
      // Initialize empty stack for redo history tracking
      this.redoStack = [];

      // Retrieve authenticated user session identifier
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Retrieve registered users database from storage
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');

      // Check if authenticated user session is active in registry
      if (currentUser && registry[currentUser]) {
        // Multi-Account Workspace Migration: ensure accounts structure exists
        if (!registry[currentUser].accounts || !Array.isArray(registry[currentUser].accounts)) {
          // Extract user display name for personal profile label
          const uName = registry[currentUser].data?.settings?.userName || 'Personal';
          // Initialize primary personal account (no demo business accounts per user requirement)
          registry[currentUser].accounts = [
            // Personal workspace descriptor
            {
              // Unique account identifier
              id: 'personal',
              // Account display name
              name: `${uName} (Personal)`,
              // Account type classification
              type: 'personal',
              // Visual icon representation
              icon: '👤',
              // Account creation ISO timestamp
              createdAt: new Date().toISOString()
            // End personal account descriptor
            }
          // End accounts list
          ];
          // Default active workspace set to personal
          registry[currentUser].activeAccountId = 'personal';
          // Initialize isolated datasets map
          registry[currentUser].accountDatasets = {
            // Personal account maps directly to existing user ledger data
            'personal': registry[currentUser].data || getSeedData()
          // End accountDatasets
          };
          // Persist upgraded registry structure to localStorage
          localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
        // End accounts migration check
        }

        // Retrieve active account identifier
        const activeAccountId = registry[currentUser].activeAccountId || 'personal';
        // Retrieve account datasets map
        const datasets = registry[currentUser].accountDatasets || {};
        // Load active account data object or fallback
        this.data = datasets[activeAccountId] || registry[currentUser].data;

        // Safety check to ensure data structures are healthy
        if (!this.data || !this.data.settings) {
          // Initialize clean seeder data
          this.data = getSeedData();
          // Persist to storage
          this.save();
        // If data exists
        } else {
          // Ensure debts array exists in loaded user data
          if (!this.data.debts) {
            // Initialize empty debts array
            this.data.debts = [];
          // End debts check
          }
          // Validate subscription duration
          this.checkPremiumExpiry();
          // Clean up any business workspaces that accidentally inherited personal ledger data
          this.cleanAccidentalInheritedData();
        // End safety check
        }
      // If no authenticated user session
      } else {
        // Fallback to default mock seeder data so components don't crash
        this.data = getSeedData();
      // End session check
      }
    },

    /**
     * Checks if a user is currently logged in.
     */
    isLoggedIn() {
      const currentUser = localStorage.getItem(SESSION_KEY);
      if (!currentUser) return false;
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      return !!(registry[currentUser] || currentUser === 'demo_user');
    },

    /**
     * Authenticates a user and sets up the active session.
     */
    /**
     * Authenticates an existing user via Supabase Cloud Auth and local storage.
     */
    async signIn(username, password) {
      const rawUsername = username.trim();
      const userKey = rawUsername.toLowerCase().replace(/\s+/g, '');
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      const client = getSupabaseClient();

      let cloudUser = null;
      let lastAuthError = null;

      // 1. Candidate emails to try on Supabase Cloud Auth
      const candidateEmails = [];
      if (rawUsername.includes('@')) {
        candidateEmails.push(rawUsername);
      } else {
        candidateEmails.push(`${userKey}@gmail.com`);
        candidateEmails.push(`${rawUsername.toLowerCase()}@gmail.com`);
        candidateEmails.push(`${rawUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`);
      }

      if (client) {
        try {
          // Attempt login with candidate emails
          for (const emailAttempt of candidateEmails) {
            const { data, error } = await client.auth.signInWithPassword({
              email: emailAttempt,
              password: password
            });
            if (data && data.user) {
              cloudUser = data.user;
              break;
            } else if (error) {
              lastAuthError = error.message;
            }
          }

          // If login failed, check if user profile exists by user_name in profiles table
          if (!cloudUser) {
            const { data: matchedProfile } = await client.from('profiles')
              .select('id, user_name')
              .or(`user_name.ilike.${rawUsername},user_name.ilike.%${rawUsername}%`)
              .maybeSingle();

            if (matchedProfile && lastAuthError && lastAuthError.toLowerCase().includes('invalid login credentials')) {
              return { success: false, message: 'Invalid password for this account. Please try again!' };
            }
          }
        } catch (err) {
          console.warn('Supabase Auth signin exception:', err);
        }
      }

      const matchedKey = registry[userKey] ? userKey : (registry[rawUsername.toLowerCase()] ? rawUsername.toLowerCase() : null);

      // 2. Validate authentication success (either Cloud Auth or Local Registry match)
      if (cloudUser || matchedKey) {
        const activeKey = matchedKey || userKey;
        if (!registry[activeKey]) {
          // User signed up on another device! Create local workspace for this authenticated cloud user
          const userData = getSeedData();
          userData.settings.userName = rawUsername;
          registry[activeKey] = {
            username: rawUsername,
            password: password,
            supabaseId: cloudUser ? cloudUser.id : null,
            data: userData
          };
          localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
        } else if (!cloudUser && registry[activeKey].password !== password) {
          return { success: false, message: 'Invalid password. Please try again.' };
        }

        // Establish active local session
        localStorage.setItem(SESSION_KEY, activeKey);
        this.data = registry[activeKey].data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        window.dispatchEvent(new CustomEvent('store-updated'));

        // Pull full financial history & profile image from Supabase Cloud
        if (client) {
          await this.fetchFromCloud();
        }

        return { success: true };
      }

      if (lastAuthError && lastAuthError.toLowerCase().includes('invalid login credentials')) {
        return { success: false, message: 'Invalid password for account. Please check your credentials and try again.' };
      }

      return { success: false, message: 'Account not found. Please check your username/email or sign up first!' };
    },

    /**
     * Registers a new user profile with clean workspace seed values and recovery questions.
     */
    async signUp(fullName, username, password, currency, securityQuestion, securityAnswer) {
      const rawUsername = username.trim();
      const userKey = rawUsername.toLowerCase();
      if (!userKey || !password || !fullName.trim()) {
        return { success: false, message: 'Please enter your Full Name, Username, and Password.' };
      }

      if (password.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters long for cloud security.' };
      }

      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');

      const client = getSupabaseClient();
      let supabaseUser = null;

      if (client) {
        // 1. Check if user_name is already registered in Supabase Cloud
        try {
          const { data: existingProfile } = await client.from('profiles').select('id').ilike('user_name', rawUsername).maybeSingle();
          if (existingProfile) {
            return { success: false, message: 'Username is already taken in cloud database. Try another username!' };
          }
        } catch (checkErr) {}

        // 2. Attempt Supabase Auth Signup
        try {
          const authEmail = rawUsername.includes('@') ? rawUsername : `${userKey}@gmail.com`;
          const { data, error } = await client.auth.signUp({
            email: authEmail,
            password: password,
            options: {
              data: {
                full_name: fullName.trim(),
                username: rawUsername,
                currency: currency || 'GH₵'
              }
            }
          });

          if (error) {
            if (error.message && error.message.toLowerCase().includes('already registered')) {
              return { success: false, message: 'This account already exists in Supabase. Try logging in instead!' };
            }
            console.warn('Supabase Auth signup notice:', error.message);
          } else if (data && data.user) {
            supabaseUser = data.user;
            console.log('Supabase Auth signup success:', supabaseUser.id);
          }
        } catch (err) {
          console.warn('Supabase Auth signup exception:', err);
        }
      } else {
        // Offline / No client fallback: check local registry
        if (registry[userKey]) {
          return { success: false, message: 'Username is already taken. Try another username!' };
        }
      }

      const secQuestion = (securityQuestion && securityQuestion.trim()) ? securityQuestion.trim() : 'What was the name of your first school?';
      const secAnswer = (securityAnswer && securityAnswer.trim()) ? securityAnswer.trim().toLowerCase() : 'school';

      // Seed a clean blueprint for the new user
      const userData = getSeedData();
      userData.settings.userName = fullName.trim();
      userData.settings.currency = currency || 'GH₵';

      // Add to accounts database with recovery questions & supabaseId
      registry[userKey] = {
        username: rawUsername,
        password: password,
        securityQuestion: secQuestion,
        securityAnswer: secAnswer,
        supabaseId: supabaseUser ? supabaseUser.id : null,
        data: userData
      };

      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
      
      // Automatically log the user in
      localStorage.setItem(SESSION_KEY, userKey);
      this.data = userData;
      
      // Save active session data
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      window.dispatchEvent(new CustomEvent('store-updated'));

      // Sync initial profile and settings to Supabase Cloud
      if (client) {
        await this.syncToCloud();
      }

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
     * Verifies security answer without changing password.
     */
    verifySecurityAnswer(username, answer) {
      const userKey = username.trim().toLowerCase();
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      if (!registry[userKey]) {
        return { success: false, message: 'Username not found in registry.' };
      }

      const storedAnswer = registry[userKey].securityAnswer || '';
      if (storedAnswer.toLowerCase() !== answer.trim().toLowerCase()) {
        return { success: false, message: 'Incorrect security answer! Verification failed.' };
      }

      return { success: true };
    },

    /**
     * Checks answer and resets password if verified.
     */
    async resetPassword(username, answer, newPassword) {
      const userKey = username.trim().toLowerCase();
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      if (!registry[userKey]) {
        return { success: false, message: 'Username not found in registry.' };
      }

      const storedAnswer = registry[userKey].securityAnswer || '';
      if (storedAnswer.toLowerCase() !== answer.trim().toLowerCase()) {
        return { success: false, message: 'Incorrect security answer! Reset failed.' };
      }

      if (newPassword.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters long.' };
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

      const client = getSupabaseClient();
      if (client && client.auth) {
        try {
          client.auth.signOut();
        } catch (e) {}
      }

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
        localStorage.setItem(SESSION_KEY, 'demo_user');
      }
      
      const authPanel = document.getElementById('authPanel');
      if (authPanel) {
        authPanel.classList.add('auth-hidden');
        authPanel.style.setProperty('display', 'none', 'important');
      }
      document.body.style.overflow = 'auto';

      if (window.syncUI) window.syncUI();
      window.dispatchEvent(new CustomEvent('store-updated'));
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
      
      const client = getSupabaseClient();
      if (client && client.auth) {
        try {
          client.auth.signOut();
        } catch (e) {}
      }

      // Wipe session variables
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(STORAGE_KEY);
      
      // Reload page context to force routing back to authOverlay if in browser
      if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
      }
    },

    /**
     * Resets all user ledger transactions, budgets, goals, and tasks locally and in Supabase Cloud.
     * Preserves profile name, currency, profile picture, and Premium membership status.
     */
    async resetAccountData() {
      const currentUserName = (this.data && this.data.settings && this.data.settings.userName) ? this.data.settings.userName : 'User';
      const currentCurrency = (this.data && this.data.settings && this.data.settings.currency) ? this.data.settings.currency : 'GH₵';
      const isPremium = (this.data && this.data.settings && this.data.settings.isPremium) || false;
      const profilePic = (this.data && this.data.settings && this.data.settings.profilePic) || null;

      const cleanData = getSeedData();
      cleanData.settings.userName = currentUserName;
      cleanData.settings.currency = currentCurrency;
      cleanData.settings.isPremium = isPremium;
      cleanData.settings.profilePic = profilePic;

      this.data = cleanData;
      this.save();

      // Clear cloud database tables for this user if connected
      const client = getSupabaseClient();
      if (client) {
        try {
          const { data: { session } } = await client.auth.getSession();
          if (session && session.user) {
            const userId = session.user.id;
            await Promise.all([
              client.from('transactions').delete().eq('user_id', userId),
              client.from('budgets').delete().eq('user_id', userId),
              client.from('savings_goals').delete().eq('user_id', userId)
            ]);
          }
        } catch (err) {
          console.warn('Supabase cloud reset notice:', err);
        }
      }

      localStorage.removeItem('GUIDE_LESSONS_COMPLETED');
      localStorage.removeItem('GUIDE_BOOKS_COMPLETED');
      localStorage.removeItem('FINANCIAL_DASHBOARD_TOUR_DONE');

      window.dispatchEvent(new CustomEvent('store-updated'));
      if (window.syncUI) window.syncUI();
      return true;
    },

    /**
     * Persists in-memory database to browser localStorage and updates user registry without pushing to cloud.
     */
    saveLocally(notifyUI = true) {
      // Serialize in-memory data to active storage key
      try {
        // Write stringified data to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      // Catch storage quota or serialization errors
      } catch (err) {
        // Warn storage failure in developer console
        console.warn('localStorage setItem failed:', err);
      // End try-catch
      }
      // Retrieve currently authenticated user session key
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Check if user session exists
      if (currentUser) {
        // Safely attempt registry data update
        try {
          // Parse users registry object from storage
          const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
          // Check if registry record exists for active user
          if (registry[currentUser]) {
            // Multi-Account Workspace: identify active workspace ID
            const activeId = registry[currentUser].activeAccountId || 'personal';
            // Ensure accountDatasets container exists in user registry
            if (!registry[currentUser].accountDatasets) registry[currentUser].accountDatasets = {};
            // Persist current active workspace dataset
            registry[currentUser].accountDatasets[activeId] = this.data;
            // Assign active data state to registry entry for backward compatibility
            registry[currentUser].data = this.data;
            // Persist modified registry to storage
            localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
          // End inner if
          }
        // Catch registry parsing or storage errors
        } catch (e) {}
      // End session if
      }
      // Synchronize header toolbar Undo/Redo button visual states
      this.updateButtonsUI();
      // Check if observers should be notified via store-updated event
      if (notifyUI) {
        // Dispatch store-updated custom event to trigger UI redraws
        window.dispatchEvent(new CustomEvent('store-updated'));
      // End notifyUI check
      }
    // End saveLocally
    },

    /**
     * Serializes and writes the in-memory data object back to localStorage.
     * Dispatches a custom event to notify all listening UI views to redraw.
     */
    save() {
      // Save data locally and notify observers
      this.saveLocally(true);
      // Trigger Cloud Sync if Supabase client is connected
      this.syncToCloud();
    // End save
    },

    /**
     * Alias for fetchFromCloud to support realtime and navigation sync listeners.
     */
    syncFromCloud() {
      // Return the fetchFromCloud promise
      return this.fetchFromCloud();
    // End syncFromCloud
    },

    /**
     * Pushes active local data state to Supabase cloud database if connected.
     */
    async syncToCloud() {
      const currentUser = localStorage.getItem(SESSION_KEY);
      if (!currentUser || currentUser === 'demo_user') return;

      const client = getSupabaseClient();
      if (!client) return;

      try {
        const { data: { session } } = await client.auth.getSession();
        if (!session || !session.user) return;

        const userId = session.user.id;
        // Retrieve current active account ID
        const activeAccountId = (this.getActiveAccount && typeof this.getActiveAccount === 'function' && this.getActiveAccount().id) || 'personal';

        // 1. Sync Profile & Settings
        const settings = this.data.settings || {};
        const profilePayload = {
          id: userId,
          user_name: settings.userName || 'User',
          currency: settings.currency || 'GH₵',
          monthly_savings_goal: settings.monthlySavingsGoal || 1200,
          is_premium: !!settings.isPremium,
          ai_queries_count: settings.aiQueriesCount || 0,
          profile_pic: (settings.profilePic !== undefined && settings.profilePic !== null) ? settings.profilePic : '',
          free_pdf_exports_used: settings.freePdfExportsUsed || 0,
          // Sync workspace accounts metadata to Supabase
          accounts: (this.getAccounts && typeof this.getAccounts === 'function') ? this.getAccounts() : [],
          // Sync business trial switches used count to Supabase
          business_switches_used: Number(settings.businessSwitchesUsed) || 0,
          updated_at: new Date().toISOString()
        };

        // Attempt to upsert profile record to Supabase
        const { error: pErr } = await client.from('profiles').upsert(profilePayload);
        // Check if an error occurred during upsert
        if (pErr) {
          // Log warning message
          console.warn('Supabase Profile Upsert Warning:', pErr.message);
          // Attempt direct update fallback in case upsert constraint failed
          try {
            // Update profile record directly
            await client.from('profiles').update({
              // Update user name
              user_name: profilePayload.user_name,
              // Update currency
              currency: profilePayload.currency,
              // Update profile picture
              profile_pic: profilePayload.profile_pic,
              // Update accounts
              accounts: profilePayload.accounts,
              // Update trial switches count
              business_switches_used: profilePayload.business_switches_used,
              // Update timestamp
              updated_at: profilePayload.updated_at
            // Filter by current user ID
            }).eq('id', userId);
          // End try-catch
          } catch(e) {}
        // End error check
        }

        // 2. Sync Transactions
        if (this.data.transactions && this.data.transactions.length > 0) {
          // Map local transactions to Supabase rows tagged with active workspace ID
          const txRows = this.data.transactions.map(tx => ({
            id: String(tx.id),
            user_id: userId,
            // Tag with active account workspace ID
            account_id: activeAccountId,
            date: tx.date,
            description: tx.description || tx.note || '',
            category: tx.category,
            type: tx.type,
            amount: Number(tx.amount),
            note: tx.note || ''
          }));
          await client.from('transactions').upsert(txRows, { onConflict: 'id' });
        }

        // 3. Sync Budgets
        if (this.data.budgets) {
          const budgetRows = Object.keys(this.data.budgets).map(cat => ({
            id: `${userId}_${cat}`,
            user_id: userId,
            category: cat,
            limit_amount: Number(this.data.budgets[cat])
          }));
          if (budgetRows.length > 0) {
            await client.from('budgets').upsert(budgetRows, { onConflict: 'id' });
          }
        }

        // 4. Sync Savings Goals
        if (this.data.goals && this.data.goals.length > 0) {
          const goalRows = this.data.goals.map(g => ({
            id: String(g.id),
            user_id: userId,
            title: g.title,
            target_amount: Number(g.targetAmount),
            current_amount: Number(g.currentAmount),
            target_date: g.targetDate || null
          }));
          await client.from('savings_goals').upsert(goalRows, { onConflict: 'id' });
        }

        // 5. Sync Debts & Loans
        if (this.data.debts && this.data.debts.length > 0) {
          // Wrap in try-catch in case remote Supabase schema doesn't have debts table yet
          try {
            // Map local debts to Supabase table rows
            const debtRows = this.data.debts.map(d => ({
              // Unique debt ID
              id: String(d.id),
              // User identifier
              user_id: userId,
              // Debt classification
              type: d.type,
              // Person or creditor name
              person: d.person,
              // Principal amount
              amount: Number(d.amount),
              // Repaid amount
              repaid: Number(d.repaid || 0),
              // Due date
              due_date: d.dueDate || null,
              // Note
              note: d.note || '',
              // Status
              status: d.status || 'active'
            // End map
            }));
            // Attempt upsert to debts table
            await client.from('debts').upsert(debtRows, { onConflict: 'id' });
          // Catch table schema or network exceptions safely
          } catch(dErr) {}
        // End debts sync check
        }
      } catch (cloudErr) {
        console.warn('Supabase cloud sync background error:', cloudErr);
      }
    },

    async saveToCloud() {
      return this.syncToCloud();
    },

    /**
     * Pulls full financial history from Supabase cloud database into local AppStore on multi-device login.
     */
    async fetchFromCloud() {
      const client = getSupabaseClient();
      if (!client) return false;

      try {
        const { data: { session } } = await client.auth.getSession();
        if (!session || !session.user) return false;

        const userId = session.user.id;
        setupRealtimeSync(userId);

        // Fetch Profile from Supabase database
        const { data: profile } = await client.from('profiles').select('*').eq('id', userId).single();
        if (profile) {
          this.data.settings.userName = profile.user_name || this.data.settings.userName;
          this.data.settings.currency = profile.currency || this.data.settings.currency;
          this.data.settings.monthlySavingsGoal = profile.monthly_savings_goal || this.data.settings.monthlySavingsGoal;
          
          // Preserve paid Premium status so cloud sync never downgrades a paid member to standard
          const isPaidLocally = this.data.settings.isPremium === true || localStorage.getItem('FINFLOW_PREMIUM_ACTIVE') === 'true';
          // Combine local paid state and cloud premium status
          this.data.settings.isPremium = isPaidLocally || (profile.is_premium === true);

          // If user is paid locally but cloud profile shows false, update Supabase cloud profile automatically
          if (isPaidLocally && !profile.is_premium) {
            try {
              await client.from('profiles').update({ is_premium: true }).eq('id', userId);
            } catch (e) {}
          }

          // Preserve query count parameter from cloud database or keep current
          this.data.settings.aiQueriesCount = profile.ai_queries_count ?? this.data.settings.aiQueriesCount;
          // Calculate elapsed time since this specific device modified its avatar locally
          const elapsedSinceLocalAvatarAction = Date.now() - (this._lastLocalAvatarUpdate || 0);
          // Protect local user avatar action from in-flight response collision for 6 seconds
          const isRecentLocalAvatarAction = elapsedSinceLocalAvatarAction < 6000;
          // If this device did not recently change the avatar locally, cloud is authoritative
          if (!isRecentLocalAvatarAction) {
            // Synchronize profile picture from cloud directly, clearing if empty string or null
            this.data.settings.profilePic = profile.profile_pic || '';
          // End local action protection check
          }
          // Verify if free PDF export count is provided in cloud profile
          if (profile.free_pdf_exports_used !== undefined && profile.free_pdf_exports_used !== null) {
            // Assign free export count to local settings
            this.data.settings.freePdfExportsUsed = profile.free_pdf_exports_used;
          }
        }

        // Retrieve current active workspace identifier
        const activeAccountId = (this.getActiveAccount && typeof this.getActiveAccount === 'function' && this.getActiveAccount().id) || 'personal';

        // 1. Fetch Transactions filtered strictly for this active workspace
        let txQuery = client.from('transactions').select('*').eq('user_id', userId);
        // If active workspace is personal, fetch records matching 'personal' or null
        if (activeAccountId === 'personal') {
          // Fetch personal or unassigned transactions
          txQuery = txQuery.or('account_id.eq.personal,account_id.is.null');
        // If active workspace is a business workspace, fetch records matching its specific ID
        } else {
          // Filter strictly by this business workspace ID
          txQuery = txQuery.eq('account_id', activeAccountId);
        // End activeAccountId condition
        }
        // Execute transactions query ordered by date descending
        const { data: cloudTxs, error: txErr } = await txQuery.order('date', { ascending: false });

        // If cloud transactions returned successfully
        if (cloudTxs && !txErr) {
          // Extra guard to filter out any transactions not belonging to this active workspace
          const validTxs = cloudTxs.filter(t => {
            // Check personal workspace criteria
            if (activeAccountId === 'personal') {
              // Return true if null or personal
              return !t.account_id || t.account_id === 'personal';
            // Check business workspace criteria
            } else {
              // Return true strictly if matching active business account ID
              return t.account_id === activeAccountId;
            // End condition
            }
          // End filter
          });

          // Map cloud rows to store format
          this.data.transactions = validTxs.map(t => ({
            // String transaction ID
            id: t.id,
            // Date string
            date: t.date,
            // Description or note
            description: t.description || t.note || '',
            // Category
            category: t.category,
            // Type
            type: t.type,
            // Numeric amount
            amount: Number(t.amount),
            // Note
            note: t.note || ''
          // End map
          }));
        // If in business workspace and no transactions exist in cloud yet, guarantee clean empty array
        } else if (activeAccountId !== 'personal' && (!this.data.transactions || txErr)) {
          // Set clean empty transactions array
          this.data.transactions = [];
        // End transactions sync
        }

        // 2. Fetch Budgets
        let bQuery = client.from('budgets').select('*').eq('user_id', userId);
        // Branch by active workspace
        if (activeAccountId === 'personal') {
          // Personal budgets match personal or null
          bQuery = bQuery.or('account_id.eq.personal,account_id.is.null');
        // Business budgets match strictly this account ID
        } else {
          // Match business ID
          bQuery = bQuery.eq('account_id', activeAccountId);
        // End budget branch
        }
        // Execute budgets query
        const { data: cloudBudgets } = await bQuery;
        // Check if budgets returned
        if (cloudBudgets) {
          // Initialize accumulator
          const budgetObj = {};
          // Loop through budget rows
          cloudBudgets.forEach(b => {
            // Check workspace match
            const matches = activeAccountId === 'personal' ? (!b.account_id || b.account_id === 'personal') : (b.account_id === activeAccountId);
            // If matches
            if (matches) {
              // Store limit amount
              budgetObj[b.category] = Number(b.limit_amount);
            // End match check
            }
          // End loop
          });
          // Assign to active dataset
          this.data.budgets = budgetObj;
        // End cloudBudgets check
        }

        // 3. Fetch Goals (Cloud is authoritative for active workspace)
        let gQuery = client.from('savings_goals').select('*').eq('user_id', userId);
        // Branch by active workspace
        if (activeAccountId === 'personal') {
          // Match personal or null
          gQuery = gQuery.or('account_id.eq.personal,account_id.is.null');
        // Business goals match strictly this account ID
        } else {
          // Match business ID
          gQuery = gQuery.eq('account_id', activeAccountId);
        // End goals branch
        }
        // Execute goals query
        const { data: cloudGoals } = await gQuery;
        // Check if goals returned
        if (cloudGoals) {
          // Filter matching workspace goals
          const validGoals = cloudGoals.filter(g => {
            // Check workspace match
            return activeAccountId === 'personal' ? (!g.account_id || g.account_id === 'personal') : (g.account_id === activeAccountId);
          // End filter
          });
          // Map to local goals format
          this.data.goals = validGoals.map(g => ({
            // Unique ID
            id: g.id,
            // Goal title
            title: g.title,
            // Target amount
            targetAmount: Number(g.target_amount),
            // Current saved amount
            currentAmount: Number(g.current_amount),
            // Target completion date
            targetDate: g.target_date
          // End map
          }));
        // End cloudGoals check
        }

        // 4. Fetch Debts & Loans (if debts table exists in cloud)
        try {
          // Query cloud debts table for this user
          let dQuery = client.from('debts').select('*').eq('user_id', userId);
          // Branch by workspace
          if (activeAccountId === 'personal') {
            // Match personal or null
            dQuery = dQuery.or('account_id.eq.personal,account_id.is.null');
          // Match business ID
          } else {
            // Match business
            dQuery = dQuery.eq('account_id', activeAccountId);
          // End debts branch
          }
          // Execute debts query
          const { data: cloudDebts } = await dQuery;
          // Check if cloud debts returned
          if (cloudDebts && cloudDebts.length > 0) {
            // Filter matching workspace debts
            const validDebts = cloudDebts.filter(d => {
              // Match criteria
              return activeAccountId === 'personal' ? (!d.account_id || d.account_id === 'personal') : (d.account_id === activeAccountId);
            // End filter
            });
            // Map cloud rows to store format
            this.data.debts = validDebts.map(d => ({
              // String debt ID
              id: d.id,
              // Debt type
              type: d.type,
              // Debtor/creditor name
              person: d.person,
              // Principal amount
              amount: Number(d.amount),
              // Repaid amount
              repaid: Number(d.repaid || 0),
              // Target due date
              dueDate: d.due_date || '',
              // Notes
              note: d.note || '',
              // Status
              status: d.status || 'active',
              // Timestamp
              createdAt: d.created_at || new Date().toISOString()
            // End map
            }));
          // End debts length check
          }
        // Catch any missing table or network errors safely
        } catch(e) {}

        // Save active state to browser localStorage without triggering a circular cloud push
        this.saveLocally(true);
        // Return true to indicate successful cloud data fetch
        return true;
      } catch (err) {
        console.warn('Supabase fetchFromCloud error:', err);
        return false;
      }
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
      if (typeof document === 'undefined') return;
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
      if (!this.data || !Array.isArray(this.data.transactions)) return []; // Guard against empty data
      return this.data.transactions; // Return full transactions array
    },

    /**
     * Records a new transaction entry to the ledger database.
     */
    addTransaction(tx) {
      this.pushState(); // Save state snapshot for Undo support
      const newTx = { // Build standard transaction object record
        id: 'tx-' + Date.now() + '-' + Math.floor(Math.random() * 1000), // Generate unique transaction ID string
        type: tx.type, // 'income' or 'expense'
        category: tx.category, // Category string
        amount: Number(tx.amount), // Force numeric type conversion
        date: tx.date || new Date().toISOString().split('T')[0], // Default YYYY-MM-DD date string
        description: tx.description || '' // Transaction note string
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
    async deleteTransaction(id) {
      // Save snapshot for Undo
      this.pushState();
      // Locate index position of transaction matching ID
      const index = this.data.transactions.findIndex(t => t.id === id);
      if (index !== -1) {
        // Remove item from transactions array
        this.data.transactions.splice(index, 1);
        // Persist update state
        this.save();

        const client = getSupabaseClient();
        if (client) {
          try {
            const { data: { session } } = await client.auth.getSession();
            if (session && session.user) {
              await client.from('transactions').delete().eq('id', id).eq('user_id', session.user.id);
            }
          } catch (e) {}
        }
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
    async deleteBudget(category) {
      // Save state snapshot for Undo
      this.pushState();
      // Delete budget category key from map
      delete this.data.budgets[category];
      // Persist values to localStorage
      this.save();

      const client = getSupabaseClient();
      if (client) {
        try {
          const { data: { session } } = await client.auth.getSession();
          if (session && session.user) {
            await client.from('budgets').delete().eq('category', category).eq('user_id', session.user.id);
          }
        } catch (e) {}
      }
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
     * Verifies if monthly subscription is still active (30 days) or expired.
     */
    /**
     * Verifies if monthly subscription is still active (30 days) or expired.
     */
    checkPremiumExpiry() {
      // Guard check to ensure active data and settings structures exist in memory
      if (!this.data || !this.data.settings) return;
      // Evaluate if current active profile is flagged as a Premium member
      if (this.data.settings.isPremium) {
        // Retrieve the expiration timestamp from settings
        const expiry = this.data.settings.premiumExpiryDate;
        // If 30-day period has elapsed, expire premium status and clear flags
        if (expiry && Date.now() > Number(expiry)) {
          // Reset premium flag to false in memory
          this.data.settings.isPremium = false;
          // Clear the expiration timestamp reference
          this.data.settings.premiumExpiryDate = null;
          // Reset subscription plan type to null
          this.data.settings.premiumPlanType = null;
          // Remove local storage flag indicating active premium status
          try { localStorage.removeItem('FINFLOW_PREMIUM_ACTIVE'); } catch (e) {}
          // Persist expired status across storage and cloud sync
          this.save();
        }
      }
    },

    /**
     * Returns the settings configuration object from memory.
     */
    getSettings() {
      // Verify whether premium duration is still active before returning settings
      this.checkPremiumExpiry();
      // Return the current settings data object
      return this.data.settings;
    },

    /**
     * Updates the user profile settings (name, currency, savings goal).
     */
    updateSettings(newSettings) {
      // Check if incoming payload contains a profile picture property
      if (newSettings && newSettings.profilePic !== undefined) {
        // Record current epoch timestamp to protect fresh avatar from stale cloud fetches
        this._lastLocalAvatarUpdate = Date.now();
      // End profile picture check
      }
      // Save state snapshot for Undo
      this.pushState();
      // Merge current setting parameters with the incoming properties
      this.data.settings = { ...this.data.settings, ...newSettings };
      // Save settings changes
      this.save();
    },

    /**
     * Sets user premium status with a 30-day monthly subscription expiration timestamp.
     */
    setPremiumStatus(isPremium, planType) {
      // Record undo stack snapshot prior to state mutation
      this.pushState();
      // Check if user status is being upgraded or revoked
      if (isPremium) {
        // Set premium boolean flag to true in settings memory
        this.data.settings.isPremium = true;
        // Record active subscription plan type or default to monthly
        this.data.settings.premiumPlanType = planType || 'monthly';
        // Calculate subscription validity days (30 days for monthly, 365 for annual)
        const durationDays = (planType === 'monthly') ? 30 : 365;
        // Compute and store future expiration timestamp
        this.data.settings.premiumExpiryDate = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        // Persist active premium marker in browser localStorage for offline durability
        try { localStorage.setItem('FINFLOW_PREMIUM_ACTIVE', 'true'); } catch (e) {}
      } else {
        // Set premium boolean flag to false in settings memory
        this.data.settings.isPremium = false;
        // Wipe active plan type record
        this.data.settings.premiumPlanType = null;
        // Wipe expiration timestamp record
        this.data.settings.premiumExpiryDate = null;
        // Remove offline premium persistence marker from localStorage
        try { localStorage.removeItem('FINFLOW_PREMIUM_ACTIVE'); } catch (e) {}
      }
      // Save data changes to localStorage and initiate cloud synchronization
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

    // --- Debts & Loans / IOUs Tracker API ---

    /**
     * Retrieves all debts and loans tracked by the user.
     */
    getDebts() {
      // Ensure debts array exists in active dataset
      if (!this.data.debts) this.data.debts = [];
      // Return cloned array of debts
      return [...this.data.debts];
    // End getDebts
    },

    /**
     * Adds a new debt or loan entry.
     */
    addDebt({ type, person, amount, dueDate, note }) {
      // Ensure debts array exists
      if (!this.data.debts) this.data.debts = [];
      // Push state snapshot for undo tracking
      this.pushState();
      // Construct new debt record
      const newDebt = {
        // Unique identifier string
        id: 'debt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        // Debt classification: 'owe' (money I borrowed) or 'lent' (money I lent)
        type: (type === 'lent') ? 'lent' : 'owe',
        // Person or institution name
        person: (person || 'Unnamed').trim(),
        // Principal amount stored in base currency (GH₵)
        amount: Math.max(0, Number(amount) || 0),
        // Cumulative repayment amount initialized to zero
        repaid: 0,
        // Optional target repayment date string (YYYY-MM-DD)
        dueDate: dueDate || '',
        // Descriptive note
        note: (note || '').trim(),
        // Current status: active or settled
        status: 'active',
        // Creation ISO timestamp
        createdAt: new Date().toISOString()
      // End newDebt
      };
      // Prepend to debts list
      this.data.debts.unshift(newDebt);
      // Persist changes to local storage and trigger cloud sync
      this.save();
      // Return created debt object
      return newDebt;
    // End addDebt
    },

    /**
     * Records a partial or full repayment toward an active debt.
     */
    recordDebtRepayment(debtId, repaymentAmount, recordToLedger = false) {
      // Verify debts array exists
      if (!this.data.debts) this.data.debts = [];
      // Find index of matching debt
      const debtIndex = this.data.debts.findIndex(d => d.id === debtId);
      // Abort if debt not found
      if (debtIndex === -1) return null;

      // Push state snapshot for undo
      this.pushState();
      // Reference target debt object
      const debt = this.data.debts[debtIndex];
      // Parse repayment numeric amount
      const payAmount = Math.max(0, Number(repaymentAmount) || 0);
      // Update cumulative repaid amount capped at principal total
      debt.repaid = Math.min(debt.amount, (Number(debt.repaid) || 0) + payAmount);
      // Determine if debt has reached full settlement
      if (debt.repaid >= debt.amount) {
        // Mark debt as settled
        debt.status = 'settled';
      // Otherwise keep as active
      } else {
        // Mark debt as active
        debt.status = 'active';
      // End status check
      }

      // Check if user requested logging repayment into main transaction ledger
      if (recordToLedger && payAmount > 0) {
        // Paying back borrowed money is an expense; receiving repaid lent money is income
        const txType = (debt.type === 'owe') ? 'expense' : 'income';
        // Format descriptive summary
        const txDesc = (debt.type === 'owe')
          ? `Debt repayment to ${debt.person}`
          : `Loan repayment received from ${debt.person}`;
        // Add transaction entry into main financial ledger
        this.addTransaction({
          // Set transaction type
          type: txType,
          // Set category
          category: (debt.type === 'owe') ? 'Utilities' : 'Other',
          // Amount in base currency
          amount: payAmount,
          // Today's date
          date: new Date().toISOString().split('T')[0],
          // Descriptive summary
          description: txDesc
        // End addTransaction
        });
      // End recordToLedger check
      }

      // Persist changes and synchronize to cloud
      this.save();
      // Return updated debt
      return debt;
    // End recordDebtRepayment
    },

    /**
     * Deletes a debt record permanently.
     */
    deleteDebt(debtId) {
      // Verify debts array exists
      if (!this.data.debts) return false;
      // Push state snapshot for undo
      this.pushState();
      // Filter out debt matching specified ID
      this.data.debts = this.data.debts.filter(d => d.id !== debtId);
      // Persist changes to storage and cloud
      this.save();
      // Return success confirmation
      return true;
    // End deleteDebt
    },

    /**
     * Calculates overall debt summary metrics (Total Owe, Total Lent, Net Balance).
     */
    getDebtSummary() {
      // Ensure debts array exists
      const debts = this.data.debts || [];
      // Initialize accumulator metrics
      let totalOwe = 0;
      let totalLent = 0;
      let totalSettled = 0;

      // Loop through all debts
      debts.forEach(debt => {
        // Compute remaining principal balance
        const remaining = Math.max(0, (Number(debt.amount) || 0) - (Number(debt.repaid) || 0));
        // Accumulate active debts you owe
        if (debt.type === 'owe' && debt.status !== 'settled') {
          // Add remaining balance to total owed
          totalOwe += remaining;
        // Accumulate active loans owed to you
        } else if (debt.type === 'lent' && debt.status !== 'settled') {
          // Add remaining balance to total lent
          totalLent += remaining;
        // End type condition
        }
        // Count settled debts
        if (debt.status === 'settled') {
          // Increment settled counter
          totalSettled++;
        // End settled check
        }
      // End debts loop
      });

      // Return calculated summary metrics object
      return {
        // Total money borrowed and still owed
        totalOwe,
        // Total money lent out and pending recovery
        totalLent,
        // Net position (Owed to Me - I Owe)
        netPosition: totalLent - totalOwe,
        // Count of settled debts
        settledCount: totalSettled,
        // Total debts count
        totalCount: debts.length
      // End return object
      };
    // End getDebtSummary
    },

    // --- Multi-Account Workspaces API (Personal vs Business) ---

    // Expose dedicated commercial categorization dictionary
    BUSINESS_CATEGORIES: BUSINESS_CATEGORIES,

    /**
     * Retrieves the list of available workspaces/accounts for the current user.
     * Guaranteed: No fake or demo business accounts are seeded by default.
     */
    getAccounts() {
      // Retrieve active user session key
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Retrieve registered users database from storage
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      // If user session exists and has accounts list
      if (currentUser && registry[currentUser] && Array.isArray(registry[currentUser].accounts)) {
        // Return shallow clone of accounts array
        return [...registry[currentUser].accounts];
      // End registry check
      }
      // Fallback for demo or non-registered sessions: return personal workspace only
      const uName = this.data?.settings?.userName || 'Personal';
      // Return single personal profile
      return [
        // Personal profile descriptor
        { id: 'personal', name: `${uName} (Personal)`, type: 'personal', icon: '👤', createdAt: new Date().toISOString() }
      // End return
      ];
    // End getAccounts
    },

    /**
     * Returns the currently active workspace/account object.
     */
    getActiveAccount() {
      // Retrieve active user session key
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Retrieve registered users database from storage
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      // Read accounts list
      const accounts = this.getAccounts();
      // Read active account identifier from user registry
      const activeId = (currentUser && registry[currentUser] && registry[currentUser].activeAccountId) || 'personal';
      // Find matching account descriptor in list
      const matched = accounts.find(a => a.id === activeId);
      // Return matched account or fallback to first account
      return matched || accounts[0] || { id: 'personal', name: 'Personal Profile', type: 'personal', icon: '👤' };
    // End getActiveAccount
    },

    /**
     * Helper to verify if the active workspace is a Business Account.
     */
    isBusinessAccount() {
      // Check if active account classification is business
      return this.getActiveAccount().type === 'business';
    // End isBusinessAccount
    },

    /**
     * Evaluates access permissions for business accounts.
     * Enforces the 2-free-trials rule for unpaid users and allows unlimited access for Premium members.
     */
    getBusinessAccessStatus() {
      // Retrieve active settings
      const settings = this.getSettings();
      // Retrieve active user session key
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Retrieve registry database from storage
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      // Check if user has active premium membership
      const isPremium = !!(settings.isPremium || (currentUser && registry[currentUser] && registry[currentUser].isPremium) || (typeof localStorage !== 'undefined' && localStorage.getItem('FINFLOW_PREMIUM_ACTIVE') === 'true'));

      // Read user-level switches counter from registry first, then fallback to settings
      const regSwitches = (currentUser && registry[currentUser] && registry[currentUser].businessSwitchesUsed !== undefined)
        ? Number(registry[currentUser].businessSwitchesUsed)
        : null;
      // Resolve switchesUsed
      const switchesUsed = (regSwitches !== null) ? regSwitches : (Number(settings.businessSwitchesUsed) || 0);
      // Max allowed free trial switches per user directive
      const maxFree = 2;

      // If premium member, grant unlimited access
      if (isPremium) {
        // Return permitted status with infinite allowance
        return { allowed: true, switchesUsed, maxFree, remaining: Infinity, isPremium: true };
      // End isPremium check
      }

      // Compute remaining free trial switches
      const remaining = Math.max(0, maxFree - switchesUsed);
      // Return allowance status based on remaining switches
      return {
        // Allowed if user has remaining trial switches
        allowed: remaining > 0,
        // Number of switches already consumed
        switchesUsed,
        // Maximum free switches allowed
        maxFree,
        // Remaining trial switches
        remaining,
        // Premium status flag
        isPremium: false
      // End return
      };
    // End getBusinessAccessStatus
    },

    /**
     * Switches the active workspace to the target account.
     * Enforces premium subscription requirement after 2 free trial accesses.
     */
    switchAccount(targetAccountId) {
      // Retrieve active account descriptor
      const currentActive = this.getActiveAccount();
      // If target account is already active, return success
      if (currentActive.id === targetAccountId) {
        // Return success with unchanged status
        return { success: true, account: currentActive, unchanged: true };
      // End identity check
      }

      // Retrieve all available accounts
      const accounts = this.getAccounts();
      // Find target account in registry
      const targetAccount = accounts.find(a => a.id === targetAccountId);
      // If target account does not exist
      if (!targetAccount) {
        // Return failure notification
        return { success: false, reason: 'Target account not found.' };
      // End not found check
      }

      // If switching to a Business Account, enforce trial access and premium gating
      if (targetAccount.type === 'business') {
        // Retrieve business access status
        const status = this.getBusinessAccessStatus();
        // If user is not allowed to access business mode
        if (!status.allowed) {
          // Trigger premium membership upgrade modal
          if (typeof window.openPremiumModal === 'function') {
            // Open modal
            window.openPremiumModal();
          // End open check
          }
          // Inform user about trial exhaustion if alert is available
          if (typeof alert === 'function') {
            // Display alert message
            alert('🔒 Business Account is a Premium feature. You have used your 2 free trial accesses. Upgrade to Premium for GH₵13.99/mo to unlock unlimited business workspaces!');
          // End alert check
          }
          // Terminate switch
          return { success: false, requiresPremium: true };
        // End not allowed check
        }

        // If not premium, consume 1 trial access
        if (!status.isPremium) {
          // Increment used counter
          const updatedUsed = (status.switchesUsed || 0) + 1;
          // Retrieve session user
          const currentUserKey = localStorage.getItem(SESSION_KEY);
          // Retrieve registry from storage
          const regObj = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
          // If registry record exists
          if (currentUserKey && regObj[currentUserKey]) {
            // Persist user-level trial switch count
            regObj[currentUserKey].businessSwitchesUsed = updatedUsed;
            // Write updated registry to storage
            localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(regObj));
          // End registry update
          }
          // Persist counter in settings
          this.updateSettings({ businessSwitchesUsed: updatedUsed });
          // Inform user of remaining trial switches
          const remainingAfter = Math.max(0, status.maxFree - updatedUsed);
          // Alert user of trial consumption if alert is available
          if (typeof alert === 'function') {
            // Display trial consumption alert
            alert(`⭐ Business Account Trial (${updatedUsed}/${status.maxFree} accesses used). ${remainingAfter > 0 ? `${remainingAfter} trial access remaining.` : 'This was your last free trial access. Upgrade to Premium for unlimited business access!'}`);
          // End alert check
          }
        // End trial counter check
        }
      // End business check
      }

      // Retrieve authenticated user session key
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Retrieve users registry
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');

      // If user session exists in registry
      if (currentUser && registry[currentUser]) {
        // Ensure account datasets map exists
        if (!registry[currentUser].accountDatasets) registry[currentUser].accountDatasets = {};
        // Save current active workspace data to its dataset slot
        registry[currentUser].accountDatasets[currentActive.id] = this.data;
        // Update active account ID pointer
        registry[currentUser].activeAccountId = targetAccountId;
        // Load target account dataset or initialize seed
        const targetData = registry[currentUser].accountDatasets[targetAccountId] || getSeedData();
        // Synchronize user-level businessSwitchesUsed into target settings
        if (registry[currentUser].businessSwitchesUsed !== undefined) {
          // Ensure settings container exists
          if (!targetData.settings) targetData.settings = {};
          // Assign global counter
          targetData.settings.businessSwitchesUsed = registry[currentUser].businessSwitchesUsed;
        // End counter sync
        }
        // Assign to active memory
        this.data = targetData;
        // Keep registry.data pointing to active dataset
        registry[currentUser].data = this.data;
        // Persist registry changes
        localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
      // End session check
      }

      // If target account is a business workspace, ensure inherited personal transactions are cleaned
      if (targetAccount.type === 'business') {
        // Run automated cleanup against accidental inheritance
        this.cleanAccidentalInheritedData();
      // End cleanup check
      }

      // Re-initialize undo/redo history for new workspace
      this.undoStack = [];
      // Clear redo stack
      this.redoStack = [];
      // Persist locally and trigger observers
      this.saveLocally(true);

      // Return success confirmation
      return { success: true, account: targetAccount };
    // End switchAccount
    },

    /**
     * Creates a new Business Account workspace.
     * Enforces trial limit and premium gate.
     */
    createBusinessAccount({ name, category, currency }) {
      // Validate business name
      const cleanName = (name || '').trim();
      // Check for empty name
      if (!cleanName) {
        // Alert user if alert function exists
        if (typeof alert === 'function') {
          // Display warning
          alert('Please enter a valid name for your business account.');
        // End alert check
        }
        // Return failure
        return { success: false, reason: 'Empty business name.' };
      // End validation
      }

      // Check business access permission
      const status = this.getBusinessAccessStatus();
      // If trial exhausted and not premium
      if (!status.allowed) {
        // Open premium modal
        if (typeof window.openPremiumModal === 'function') window.openPremiumModal();
        // Inform user if alert function is available
        if (typeof alert === 'function') {
          // Display alert
          alert('🔒 Business Account creation is a Premium feature. You have used your 2 free trial accesses. Upgrade to Premium for GH₵13.99/mo to create business accounts!');
        // End alert check
        }
        // Terminate
        return { success: false, requiresPremium: true };
      // End allowed check
      }

      // Retrieve authenticated user session key
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Retrieve users registry
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');

      // Generate unique business account ID
      const newAccountId = `biz_${Date.now()}`;
      // Determine currency
      const activeCurr = currency || this.getSettings().currency || 'GH₵';

      // Construct business account descriptor
      const newAccount = {
        // Unique ID
        id: newAccountId,
        // Business display name
        name: cleanName,
        // Account classification
        type: 'business',
        // Visual icon
        icon: '💼',
        // Business category
        businessCategory: category || 'General Commerce',
        // Currency symbol
        currency: activeCurr,
        // Creation timestamp
        createdAt: new Date().toISOString()
      // End descriptor
      };

      // Construct clean, isolated seed dataset tailored specifically for business operations
      const newDataset = getSeedData();
      // Set business name
      newDataset.settings.userName = cleanName;
      // Set business currency
      newDataset.settings.currency = activeCurr;
      // Inherit user's premium status
      newDataset.settings.isPremium = this.getSettings().isPremium;
      // Inherit premium expiration timestamp
      newDataset.settings.premiumUntil = this.getSettings().premiumUntil;
      // Seed default business budget categories with zero limits
      newDataset.budgets = {
        'Inventory / Stock (COGS)': 0,
        'Payroll & Staff Wages': 0,
        'Workspace / Shop Rent': 0,
        'Marketing, Ads & Promotions': 0,
        'Utilities & Internet': 0
      // End budgets
      };

      // If user session exists
      if (currentUser && registry[currentUser]) {
        // Ensure accounts array exists
        if (!registry[currentUser].accounts) registry[currentUser].accounts = [];
        // Append new business account
        registry[currentUser].accounts.push(newAccount);
        // Ensure datasets map exists
        if (!registry[currentUser].accountDatasets) registry[currentUser].accountDatasets = {};
        // Save current active data
        const currentActiveId = registry[currentUser].activeAccountId || 'personal';
        // Persist current active
        registry[currentUser].accountDatasets[currentActiveId] = this.data;
        // Store new business dataset
        registry[currentUser].accountDatasets[newAccountId] = newDataset;
        // Update active pointer to new business account
        registry[currentUser].activeAccountId = newAccountId;
        // Point in-memory data to new dataset
        this.data = newDataset;
        // Update registry data pointer
        registry[currentUser].data = this.data;
        // Persist registry changes
        localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
      // End registry update
      }

      // If unpaid user, consume 1 trial access
      if (!status.isPremium) {
        // Increment trial counter
        const updatedUsed = (status.switchesUsed || 0) + 1;
        // Check if user session exists in registry
        if (currentUser && registry[currentUser]) {
          // Persist user-level trial counter in registry
          registry[currentUser].businessSwitchesUsed = updatedUsed;
          // Write updated registry to localStorage
          localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
        // End registry update check
        }
        // Persist counter in settings
        this.updateSettings({ businessSwitchesUsed: updatedUsed });
        // Inform user of trial usage
        const remainingAfter = Math.max(0, status.maxFree - updatedUsed);
        // Toast message if alert is available
        if (typeof alert === 'function') {
          // Display trial notification
          alert(`🎉 Business Workspace "${cleanName}" created! (${updatedUsed}/${status.maxFree} trial accesses used).`);
        // End alert check
        }
      // End trial check
      } else {
        // Toast success message if alert is available
        if (typeof alert === 'function') {
          // Display success notification
          alert(`🎉 Business Workspace "${cleanName}" created successfully!`);
        // End alert check
        }
      // End premium check
      }

      // Reset undo stack
      this.undoStack = [];
      // Reset redo stack
      this.redoStack = [];
      // Save locally and trigger UI redraw
      this.saveLocally(true);

      // Return success confirmation
      return { success: true, account: newAccount };
    // End createBusinessAccount
    },

    /**
     * Deletes a business account workspace permanently.
     * Prevents deletion of the primary Personal Account.
     */
    deleteBusinessAccount(accountId) {
      // Prevent deletion of primary personal account
      if (accountId === 'personal') {
        // Alert user if alert function is available
        if (typeof alert === 'function') {
          // Display prevention alert
          alert('Cannot delete your primary Personal Account.');
        // End alert check
        }
        // Return failure
        return false;
      // End check
      }

      // Retrieve user session
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Retrieve registry
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');

      // If user session exists
      if (currentUser && registry[currentUser]) {
        // Filter out account from accounts list
        registry[currentUser].accounts = (registry[currentUser].accounts || []).filter(a => a.id !== accountId);
        // Delete account dataset
        if (registry[currentUser].accountDatasets) {
          // Delete dataset key
          delete registry[currentUser].accountDatasets[accountId];
        // End delete
        }

        // If currently active account was the deleted one, switch back to personal
        if (registry[currentUser].activeAccountId === accountId) {
          // Set active back to personal
          registry[currentUser].activeAccountId = 'personal';
          // Load personal dataset
          this.data = (registry[currentUser].accountDatasets && registry[currentUser].accountDatasets['personal']) || registry[currentUser].data;
        // End switch check
        }

        // Persist registry
        localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
        // Reset undo history
        this.undoStack = [];
        // Reset redo history
        this.redoStack = [];
        // Save and trigger UI
        this.saveLocally(true);
        // Return true
        return true;
      // End user check
      }
      // Return false
      return false;
    // End deleteBusinessAccount
    },

    /**
     * Cleans up any business accounts that accidentally inherited personal ledger transactions.
     * Guarantees that newly created business workspaces start cleanly from zero without contamination.
     */
    cleanAccidentalInheritedData() {
      // Retrieve authenticated user session key
      const currentUser = localStorage.getItem(SESSION_KEY);
      // Retrieve registered users database
      const registry = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '{}');
      // Guard if user session or datasets map do not exist
      if (!currentUser || !registry[currentUser] || !registry[currentUser].accountDatasets) return;

      // Extract personal account dataset
      const personalData = registry[currentUser].accountDatasets['personal'];
      // Guard if personal dataset does not exist
      if (!personalData) return;

      // Collect personal transaction IDs into a lookup Set
      const personalTxIds = new Set((personalData.transactions || []).map(t => String(t.id)));
      // Retrieve registered accounts list
      const accounts = registry[currentUser].accounts || [];
      // Modification tracker flag
      let cleanedAny = false;

      // Loop through all registered workspaces
      accounts.forEach(acc => {
        // Only inspect business accounts
        if (acc.type === 'business' && registry[currentUser].accountDatasets[acc.id]) {
          // Reference business dataset
          const bizData = registry[currentUser].accountDatasets[acc.id];
          // Check if business dataset has transactions
          if (bizData.transactions && bizData.transactions.length > 0) {
            // Count original transactions length
            const originalLength = bizData.transactions.length;
            // Filter out transactions that originated from personal account
            bizData.transactions = bizData.transactions.filter(t => !personalTxIds.has(String(t.id)));
            // Check if any personal transactions were stripped
            if (bizData.transactions.length !== originalLength) {
              // Mark modification flag
              cleanedAny = true;
            // End length check
            }
          // End transactions check
          }
        // End business check
        }
      // End accounts loop
      });

      // If modifications occurred, persist to storage
      if (cleanedAny) {
        // Write updated registry to localStorage
        localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
        // Retrieve active account ID
        const activeId = registry[currentUser].activeAccountId;
        // If active workspace was cleaned, reload active data in memory
        if (activeId && activeId !== 'personal' && registry[currentUser].accountDatasets[activeId]) {
          // Assign cleaned dataset to active memory
          this.data = registry[currentUser].accountDatasets[activeId];
        // End activeId check
        }
      // End cleanedAny check
      }
    // End cleanAccidentalInheritedData
    },

    /**
     * Resets the active workspace dataset completely to zero.
     * Clears all transactions, budgets, goals, and debts for the active workspace.
     */
    resetActiveWorkspaceData() {
      // Retrieve active workspace descriptor
      const activeAccount = this.getActiveAccount();
      // Record undo history snapshot
      this.pushState();

      // Create clean, isolated seed dataset
      const cleanDataset = getSeedData();
      // Set account name
      cleanDataset.settings.userName = activeAccount.name;
      // Set account currency
      cleanDataset.settings.currency = activeAccount.currency || this.getSettings().currency || 'GH₵';
      // Inherit premium status
      cleanDataset.settings.isPremium = this.getSettings().isPremium;
      // Inherit premium expiration timestamp
      cleanDataset.settings.premiumUntil = this.getSettings().premiumUntil;
      // Inherit user-level trial switch counter
      cleanDataset.settings.businessSwitchesUsed = this.getSettings().businessSwitchesUsed;

      // If resetting a business workspace, seed standard zero budgets
      if (activeAccount.type === 'business') {
        // Default business budget categories
        cleanDataset.budgets = {
          // Inventory / COGS limit
          'Inventory / Stock (COGS)': 0,
          // Wages limit
          'Payroll & Staff Wages': 0,
          // Rent limit
          'Workspace / Shop Rent': 0,
          // Marketing limit
          'Marketing, Ads & Promotions': 0,
          // Utilities limit
          'Utilities & Internet': 0
        // End budgets
        };
      // End business check
      }

      // Assign cleaned dataset to active memory
      this.data = cleanDataset;

      // Save locally to persist dataset in registry and active storage
      this.saveLocally(true);

      // If cloud client is connected, also clear cloud transactions for this specific account_id
      const client = getSupabaseClient();
      // Check client
      if (client) {
        // Execute asynchronous cloud cleanup
        client.auth.getSession().then(({ data: { session } }) => {
          // If session exists
          if (session && session.user) {
            // Delete cloud transactions matching this specific user and account_id
            client.from('transactions').delete().eq('user_id', session.user.id).eq('account_id', activeAccount.id).then(() => {});
          // End session check
          }
        // End getSession
        });
      // End client check
      }

      // Return success confirmation
      return true;
    // End resetActiveWorkspaceData
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

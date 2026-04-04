const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// In-memory store (use database in production)
let sessions = new Map();
let qboTokens = null;
let cashproTokens = null;

// QuickBooks configuration
const QBO_CONFIG = {
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  redirectUri: process.env.QBO_REDIRECT_URI || 'http://localhost:3000/qbo/callback',
  scope: 'com.intuit.quickbooks.accounting',
  discoveryDocument: 'https://appcenter.intuit.com/connect/oauth2'
};

// CashPro configuration
const CASHPRO_CONFIG = {
  clientId: process.env.CASHPRO_CLIENT_ID,
  clientSecret: process.env.CASHPRO_CLIENT_SECRET,
  baseUrl: process.env.CASHPRO_BASE_URL || 'https://api.cashpro.bankofamerica.com',
  redirectUri: process.env.CASHPRO_REDIRECT_URI || 'http://localhost:3000/cashpro/callback'
};

// Utility functions
const generateState = () => crypto.randomBytes(16).toString('hex');
const base64Encode = (str) => Buffer.from(str).toString('base64');

// ── Routes ────────────────────────────────────────────────────────────────────

// Main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Legal pages
app.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>Privacy Policy - NauticALL Corporate Accounting Dashboard</title></head>
    <body style="font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1>Privacy Policy</h1>
      <p><strong>Last updated: ${new Date().toLocaleDateString()}</strong></p>
      <p>NauticALL Corporate Accounting Dashboard is committed to protecting your privacy.</p>
      <h2>Information We Collect</h2>
      <p>We access your QuickBooks Online data solely for accounting dashboard functionality. We do not store, share, or sell your financial data.</p>
      <h2>How We Use Your Information</h2>
      <p>Your QuickBooks data is used only to display financial information within our internal corporate dashboard.</p>
      <h2>Data Security</h2>
      <p>All connections use encrypted protocols (HTTPS/OAuth 2.0).</p>
      <h2>Contact Us</h2>
      <p>For questions contact us at info@nauticall.com.</p>
    </body></html>
  `);
});

app.get('/eula', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>EULA - NauticALL Corporate Accounting Dashboard</title></head>
    <body style="font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1>End User License Agreement</h1>
      <p><strong>Last updated: ${new Date().toLocaleDateString()}</strong></p>
      <p>This Agreement governs your use of NauticALL Corporate Accounting Dashboard.</p>
      <h2>License Grant</h2>
      <p>We grant you a limited, non-exclusive license to use this internal corporate accounting dashboard.</p>
      <h2>Restrictions</h2>
      <p>You may not modify, distribute, or reverse engineer this software. For internal corporate use only.</p>
      <h2>Disclaimer</h2>
      <p>This software is provided "as is" without warranties.</p>
      <h2>Contact</h2>
      <p>For questions contact us at info@nauticall.com.</p>
    </body></html>
  `);
});

// ── QBO OAuth ─────────────────────────────────────────────────────────────────

app.get('/auth/qbo', (req, res) => {
  const state = generateState();
  sessions.set(state, { provider: 'qbo', timestamp: Date.now() });

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
    `client_id=${QBO_CONFIG.clientId}&` +
    `scope=${QBO_CONFIG.scope}&` +
    `redirect_uri=${encodeURIComponent(QBO_CONFIG.redirectUri)}&` +
    `response_type=code&` +
    `access_type=offline&` +
    `state=${state}`;

  res.redirect(authUrl);
});

app.get('/qbo/callback', async (req, res) => {
  console.log('QBO Callback received:', req.query);
  const { code, realmId } = req.query;

  if (!code || !realmId) {
    return res.status(400).json({ error: 'Missing code or realmId' });
  }

  try {
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Encode(`${QBO_CONFIG.clientId}:${QBO_CONFIG.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: QBO_CONFIG.redirectUri
      })
    });

    const tokens = await tokenResponse.json();
    console.log('Tokens received:', tokens);
    qboTokens = { ...tokens, realmId, timestamp: Date.now() };

    res.redirect('/?qbo=connected');
  } catch (error) {
    console.error('QBO OAuth error:', error);
    res.status(500).json({ error: 'OAuth failed' });
  }
});

// ── CashPro OAuth ─────────────────────────────────────────────────────────────

app.get('/auth/cashpro', (req, res) => {
  const state = generateState();
  sessions.set(state, { provider: 'cashpro', timestamp: Date.now() });

  const authUrl = `${CASHPRO_CONFIG.baseUrl}/oauth2/authorize?` +
    `client_id=${CASHPRO_CONFIG.clientId}&` +
    `redirect_uri=${encodeURIComponent(CASHPRO_CONFIG.redirectUri)}&` +
    `response_type=code&` +
    `scope=account_info transactions&` +
    `state=${state}`;

  res.redirect(authUrl);
});

app.get('/cashpro/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!sessions.has(state)) {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  try {
    const tokenResponse = await fetch(`${CASHPRO_CONFIG.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Encode(`${CASHPRO_CONFIG.clientId}:${CASHPRO_CONFIG.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: CASHPRO_CONFIG.redirectUri
      })
    });

    const tokens = await tokenResponse.json();
    cashproTokens = { ...tokens, timestamp: Date.now() };
    sessions.delete(state);

    res.redirect('/?cashpro=connected');
  } catch (error) {
    console.error('CashPro OAuth error:', error);
    res.status(500).json({ error: 'OAuth failed' });
  }
});

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshQboToken() {
  if (!qboTokens || !qboTokens.refresh_token) return false;

  try {
    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Encode(`${QBO_CONFIG.clientId}:${QBO_CONFIG.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: qboTokens.refresh_token
      })
    });

    const newTokens = await response.json();
    qboTokens = { ...qboTokens, ...newTokens, timestamp: Date.now() };
    return true;
  } catch (error) {
    console.error('QBO token refresh failed:', error);
    return false;
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    qbo: !!qboTokens?.access_token,
    cashpro: !!cashproTokens?.access_token,
    qboExpiry: qboTokens ? new Date(qboTokens.timestamp + (qboTokens.expires_in * 1000)) : null,
    cashproExpiry: cashproTokens ? new Date(cashproTokens.timestamp + (cashproTokens.expires_in * 1000)) : null
  });
});

// ── QBO: Invoices ─────────────────────────────────────────────────────────────

app.get('/api/qbo/invoices', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  try {
    const response = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=SELECT * FROM Invoice`, {
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 401) {
      const refreshed = await refreshQboToken();
      if (refreshed) return res.redirect('/api/qbo/invoices');
      return res.status(401).json({ error: 'Token expired' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('QBO API error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

app.post('/api/qbo/invoices', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  const { client, amount, dueDate, description, itemId, itemName } = req.body;
  console.log('Invoice creation request:', { client, amount, dueDate, description });

  try {
    console.log('Looking for customer:', client);
    const customerResponse = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=SELECT * FROM Customer WHERE DisplayName='${client}'`, {
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    const customerData = await customerResponse.json();
    console.log('Customer lookup response:', JSON.stringify(customerData, null, 2));
    let customerId;

    if (customerData.QueryResponse?.Customer && customerData.QueryResponse.Customer.length > 0) {
      customerId = customerData.QueryResponse.Customer[0].Id;
      console.log('Found existing customer ID:', customerId);
    } else {
      console.log('Creating new customer...');
      const newCustomerResponse = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/customer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${qboTokens.access_token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          DisplayName: client,
          CompanyName: client
        })
      });

      const newCustomerData = await newCustomerResponse.json();
      console.log('New customer response:', JSON.stringify(newCustomerData, null, 2));
      customerId = newCustomerData.QueryResponse?.Customer?.[0]?.Id || newCustomerData.Customer?.Id;
      console.log('Final customer ID:', customerId);
    }

    const invoiceResponse = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/invoice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        CustomerRef: { value: customerId },
        DueDate: dueDate,
        Line: [{
          Amount: amount,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: { value: itemId, name: itemName }
          }
        }]
      })
    });

    console.log('Invoice response status:', invoiceResponse.status);
    const invoiceData = await invoiceResponse.json();
    console.log('Invoice creation response:', JSON.stringify(invoiceData, null, 2));
    res.json(invoiceData);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// ── QBO: Bills ────────────────────────────────────────────────────────────────

app.get('/api/qbo/bills', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  try {
    const response = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=SELECT * FROM Bill MAXRESULTS 1000`, {
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 401) {
      const refreshed = await refreshQboToken();
      if (refreshed) return res.redirect('/api/qbo/bills');
      return res.status(401).json({ error: 'Token expired' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('QBO API error:', error);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

app.post('/api/qbo/bills', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  const { vendor, amount, dueDate, description, itemId, itemName } = req.body;
  console.log('Bill creation request:', { vendor, amount, dueDate, itemId, itemName });

  try {
    // Find vendor in QBO
    const vendorQuery = `SELECT * FROM Vendor WHERE DisplayName='${vendor}'`;
    const vendorResponse = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=${encodeURIComponent(vendorQuery)}`, {
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    const vendorData = await vendorResponse.json();
    console.log('Vendor lookup result:', JSON.stringify(vendorData));
    const vendorId = vendorData.QueryResponse?.Vendor?.[0]?.Id;

    if (!vendorId) {
      return res.status(400).json({ error: `Vendor "${vendor}" not found in QBO` });
    }

    let lineItem;
    let expenseAccountId = null;

    if (itemId) {
      // Fetch the item to get its expense account
      const itemResponse = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/item/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${qboTokens.access_token}`,
          'Accept': 'application/json'
        }
      });
      const itemResult = await itemResponse.json();
      console.log('Item lookup result:', JSON.stringify(itemResult));
      expenseAccountId = itemResult.Item?.ExpenseAccountRef?.value;
    }

    if (expenseAccountId) {
      // Use the item's own expense account
      lineItem = {
        Amount: amount,
        DetailType: 'AccountBasedExpenseLineDetail',
        Description: itemName || description,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: expenseAccountId }
        }
      };
    } else {
      // No item selected or item has no expense account — look up a general expense account
      const accountQuery = `SELECT * FROM Account WHERE AccountType='Expense' MAXRESULTS 1`;
      const accountResponse = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=${encodeURIComponent(accountQuery)}`, {
        headers: {
          'Authorization': `Bearer ${qboTokens.access_token}`,
          'Accept': 'application/json'
        }
      });
      const accountData = await accountResponse.json();
      console.log('Account lookup result:', JSON.stringify(accountData));
      const accountId = accountData.QueryResponse?.Account?.[0]?.Id;

      if (!accountId) {
        return res.status(400).json({ error: 'No expense account found in QBO. Please select a Product/Service.' });
      }

      lineItem = {
        Amount: amount,
        DetailType: 'AccountBasedExpenseLineDetail',
        Description: itemName || description,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: accountId }
        }
      };
    }

    const billPayload = {
      VendorRef: { value: vendorId },
      DueDate: dueDate,
      Line: [lineItem]
    };
    console.log('Bill payload:', JSON.stringify(billPayload));

    const billResponse = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/bill`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(billPayload)
    });

    console.log('Bill response status:', billResponse.status);
    const billData = await billResponse.json();
    console.log('Bill creation response:', JSON.stringify(billData, null, 2));

    if (billData.Fault) {
      const qboError = billData.Fault.Error?.[0]?.Message || 'Unknown QBO error';
      console.error('QBO Fault:', JSON.stringify(billData.Fault));
      return res.status(400).json({ error: qboError });
    }

    res.json(billData);
  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ error: error.message || 'Failed to create bill' });
  }
});

// ── QBO: Send Invoice Reminder ────────────────────────────────────────────────

app.post('/api/qbo/send-reminder', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  const { invoiceId } = req.body;
  if (!invoiceId) {
    return res.status(400).json({ error: 'Missing invoiceId' });
  }

  try {
    const response = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/invoice/${invoiceId}/send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${qboTokens.access_token}`,
          'Content-Type': 'application/octet-stream',
          'Accept': 'application/json'
        }
      }
    );

    if (response.status === 401) {
      const refreshed = await refreshQboToken();
      if (refreshed) {
        return res.redirect(307, '/api/qbo/send-reminder');
      }
      return res.status(401).json({ error: 'Token expired' });
    }

    const data = await response.json();
    if (data.Fault) {
      const qboError = data.Fault.Error?.[0]?.Message || 'Unknown QBO error';
      console.error('QBO send reminder fault:', JSON.stringify(data.Fault));
      return res.status(400).json({ error: qboError });
    }

    console.log(`Reminder sent for invoice ${invoiceId}`);
    res.json({ success: true, invoice: data.Invoice });
  } catch (error) {
    console.error('Send reminder error:', error);
    res.status(500).json({ error: error.message || 'Failed to send reminder' });
  }
});

// ── QBO: Items, Customers, Classes, Vendors ───────────────────────────────────

app.get('/api/qbo/items', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  try {
    const response = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=SELECT * FROM Item`, {
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.get('/api/qbo/customers', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  try {
    const response = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=SELECT * FROM Customer MAXRESULTS 1000`, {
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.get('/api/qbo/classes', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  try {
    const response = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=SELECT * FROM Class MAXRESULTS 1000`, {
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

app.get('/api/qbo/bank-transactions', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }
  try {
    const [depRes, purRes] = await Promise.all([
      fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Deposit MAXRESULTS 200')}`, {
        headers: { 'Authorization': `Bearer ${qboTokens.access_token}`, 'Accept': 'application/json' }
      }),
      fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Purchase MAXRESULTS 200')}`, {
        headers: { 'Authorization': `Bearer ${qboTokens.access_token}`, 'Accept': 'application/json' }
      })
    ]);
    const depData = await depRes.json();
    const purData = await purRes.json();
    res.json({
      deposits: depData.QueryResponse?.Deposit || [],
      purchases: purData.QueryResponse?.Purchase || []
    });
  } catch (error) {
    console.error('Bank transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch bank transactions' });
  }
});

app.get('/api/qbo/vendors', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  try {
    const response = await fetch(`https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=SELECT * FROM Vendor MAXRESULTS 1000`, {
      headers: {
        'Authorization': `Bearer ${qboTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// ── QBO: Bank Accounts ────────────────────────────────────────────────────────

app.get('/api/qbo/accounts', async (req, res) => {
  if (!qboTokens?.access_token) {
    return res.status(401).json({ error: 'QBO not connected' });
  }

  try {
    const response = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${qboTokens.realmId}/query?query=SELECT * FROM Account WHERE AccountType='Bank' MAXRESULTS 100`,
      {
        headers: {
          'Authorization': `Bearer ${qboTokens.access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (response.status === 401) {
      const refreshed = await refreshQboToken();
      if (refreshed) return res.redirect('/api/qbo/accounts');
      return res.status(401).json({ error: 'Token expired' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('QBO accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

// ── CashPro API ───────────────────────────────────────────────────────────────

app.get('/api/cashpro/accounts', async (req, res) => {
  if (!cashproTokens?.access_token) {
    return res.status(401).json({ error: 'CashPro not connected' });
  }

  try {
    const response = await fetch(`${CASHPRO_CONFIG.baseUrl}/v1/accounts`, {
      headers: {
        'Authorization': `Bearer ${cashproTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('CashPro API error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

app.get('/api/cashpro/transactions', async (req, res) => {
  if (!cashproTokens?.access_token) {
    return res.status(401).json({ error: 'CashPro not connected' });
  }

  const { accountId, startDate, endDate } = req.query;

  try {
    const response = await fetch(`${CASHPRO_CONFIG.baseUrl}/v1/accounts/${accountId}/transactions?startDate=${startDate}&endDate=${endDate}`, {
      headers: {
        'Authorization': `Bearer ${cashproTokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('CashPro API error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ── Health check & error handling ─────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Accounting dashboard running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
  console.log('QBO OAuth: http://localhost:3000/auth/qbo');
  console.log('CashPro OAuth: http://localhost:3000/auth/cashpro');
});

module.exports = app;

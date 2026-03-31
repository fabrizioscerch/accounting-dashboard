# Accounting Dashboard Setup Guide

## What You've Built
A complete accounting automation system that connects QuickBooks Online and Bank of America CashPro for:
- Invoice management and automated reminders
- Bill approval workflow  
- Bank reconciliation
- Real-time financial dashboard

## Files You Have
- **server.js** - Main Node.js backend with API integrations
- **package.json** - Dependencies and scripts
- **index.html** - Frontend dashboard (put this in a 'public' folder)
- **.env.template** - Environment configuration template
- This README file

## Step-by-Step Setup

### 1. Prerequisites
- Install Node.js 16+ from nodejs.org
- Have QuickBooks Online account with admin access
- Have Bank of America CashPro access

### 2. Create Project Structure
```bash
mkdir accounting-dashboard
cd accounting-dashboard

# Copy these files into the directory:
# - server.js 
# - package.json
# - .env.template

# Create public folder and move HTML file there
mkdir public
# Move index.html into the public folder
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Get QuickBooks API Credentials
1. Go to https://developer.intuit.com
2. Sign in with your Intuit account
3. Click "Create an app" → select "QuickBooks Online and Payments"
4. Fill in app details (name: "Accounting Dashboard", description: "Internal accounting automation")
5. In Development Settings:
   - Redirect URIs: `http://localhost:3000/qbo/callback`
   - Note your Client ID and Client Secret

### 5. Request CashPro API Access
Use the email template provided earlier to contact your BofA relationship manager requesting CashPro API access. This typically takes 1-2 weeks.

### 6. Configure Environment
```bash
# Copy the template to create your config file
cp .env.template .env

# Edit .env and fill in your credentials:
# QBO_CLIENT_ID=your_actual_client_id
# QBO_CLIENT_SECRET=your_actual_client_secret
# (Leave CashPro settings blank until you get API access)
```

### 7. Run the Application
```bash
# Development mode (auto-restart on changes)
npm run dev

# Or production mode
npm start
```

Visit: http://localhost:3000

### 8. Connect Your Accounts
1. Click "Connect QuickBooks Online"
2. Sign in with your QBO credentials
3. Authorize the application
4. Once CashPro API is approved, click "Connect CashPro"

## File Structure Should Look Like:
```
accounting-dashboard/
├── server.js
├── package.json
├── .env
├── .env.template
├── README.md
├── public/
│   └── index.html
└── node_modules/ (created after npm install)
```

## Troubleshooting
- **"Cannot find module" errors**: Run `npm install` 
- **QBO connection fails**: Check your Client ID/Secret in .env
- **Port 3000 in use**: Change PORT=3001 in .env file
- **CashPro not working**: API access must be approved by BofA first

## Next Steps After Setup
1. Test with a few sample invoices and bills
2. Set up deployment to Render or similar service
3. Configure automated email reminders
4. Add database for persistent storage
5. Implement additional approval workflows

## Security Notes
- Never commit the .env file to version control
- Use HTTPS in production
- Consider adding user authentication for multi-user access
- Regularly rotate API credentials

## Support
- QuickBooks API issues: Intuit Developer Support
- CashPro API issues: Your BofA relationship manager
- General questions: Check the Intuit and BofA developer documentation

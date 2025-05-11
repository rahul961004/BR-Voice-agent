const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const port = 8081;

// Load environment variables from mcp_config.json
const fs = require('fs');
const mcpConfig = JSON.parse(fs.readFileSync('./mcp_config.json', 'utf8'));
const SQUARE_ACCESS_TOKEN = mcpConfig.servers.square.env.SQUARE_ACCESS_TOKEN;
const LOCATION_ID = mcpConfig.servers.square.env.LOCATION_ID;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('./'));

// MCP endpoints
app.get('/mcp/servers/square/env', (req, res) => {
  res.json({
    SQUARE_ACCESS_TOKEN,
    LOCATION_ID
  });
});

// Get Square catalog
app.get('/mcp/servers/square/v2/catalog/list', async (req, res) => {
  try {
    // Use the sandbox URL for testing
    const response = await axios.get('https://connect.squareupsandbox.com/v2/catalog/list', {
      params: req.query,
      headers: {
        'Square-Version': '2023-09-25',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Square catalog fetched successfully');
    res.json(response.data);
  } catch (error) {
    console.error('Square API Error:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { message: error.message });
  }
});

// Create Square order
app.post('/mcp/servers/square/v2/orders', async (req, res) => {
  console.log('Received order request:', JSON.stringify(req.body, null, 2));
  
  try {
    // Make sure we're using the sandbox API URL
    const squareApiUrl = 'https://connect.squareupsandbox.com/v2/orders';
    console.log(`Sending request to Square Sandbox API: ${squareApiUrl}`);
    
    // Ensure the order contains all required fields
    if (!req.body.order) {
      req.body = {
        order: {
          location_id: LOCATION_ID,
          line_items: req.body.line_items || []
        },
        idempotency_key: req.body.idempotency_key || Date.now().toString()
      };
    }
    
    // If location_id isn't set, use the one from config
    if (!req.body.order.location_id) {
      req.body.order.location_id = LOCATION_ID;
    }
    
    // Ensure there's an idempotency key
    if (!req.body.idempotency_key) {
      req.body.idempotency_key = Date.now().toString();
    }
    
    console.log('Final order payload:', JSON.stringify(req.body, null, 2));
    
    const response = await axios.post(squareApiUrl, req.body, {
      headers: {
        'Square-Version': '2023-09-25',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Square order created successfully:', JSON.stringify(response.data, null, 2));
    res.json(response.data);
  } catch (error) {
    console.error('Square API Error Details:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error without response:', error.message);
    }
    res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { message: error.message });
  }
});

// End call tool
app.post('/mcp/tools/end_call', (req, res) => {
  console.log('Call ended via MCP');
  res.json({ success: true, message: 'Call ended' });
});

// Start server
app.listen(port, () => {
  console.log(`MCP server running at http://localhost:${port}`);
});

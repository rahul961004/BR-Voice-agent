# ElevenLabs to Square MCP Integration

This document explains the integration between ElevenLabs Conversational Voice Widget and Square's Point of Sale system using MCP (Multiple Command Protocol).

## Overview

This integration allows a customer to place an order using voice through the ElevenLabs widget. The system:

1. Captures the entire conversation
2. Extracts customer name and order details
3. When the call ends, sends structured order data to Square's sandbox environment
4. Creates a valid order in Square with proper line items

## Components

### 1. ElevenLabs Widget
- Embedded in index.html with agent-id: U95ETaD2JpoAJTDuMHQT
- Handles all voice interaction with the customer

### 2. Square MCP Server
- Located in `mcp_server.js`
- Runs on port 5000
- Provides API endpoint for order creation
- Matches order items to Square catalog
- Submits orders to Square sandbox

### 3. Main Application
- Located in `main.js`
- Extracts order information from conversation
- Sends structured data to MCP server
- Displays order confirmation

## Configuration

All configuration is stored in `mcp_config.json`:

```json
{
  "servers": {
    "elevenlabs": {
      "url": "http://localhost:5001",
      "env": {
        "ELEVENLABS_API_KEY": "YOUR_KEY_HERE"
      }
    },
    "square": {
      "url": "https://connect.squareupsandbox.com",
      "env": {
        "SQUARE_ACCESS_TOKEN": "YOUR_SANDBOX_TOKEN",
        "LOCATION_ID": "YOUR_LOCATION_ID"
      }
    },
    "mcp": {
      "url": "http://localhost:5000",
      "env": {}
    }
  },
  "tools": {
    "end_call": {
      "server": "elevenlabs",
      "path": "/api/end_call",
      "method": "POST"
    },
    "create_order": {
      "server": "mcp",
      "path": "/api/create_order",
      "method": "POST"
    },
    "calculate_order": {
      "server": "square",
      "path": "/v2/orders/calculate",
      "method": "POST"
    }
  }
}
```

## How to Run

1. Start the Square MCP server:
   ```
   node mcp_server.js
   ```

2. Start the main web server:
   ```
   node server.js
   ```

3. Open the application at http://localhost:8081

## How It Works

1. **Customer Interaction**:
   - Customer speaks to the ElevenLabs widget
   - System captures entire conversation and stores it in memory

2. **Customer Identification**:
   - System attempts to extract customer name from early conversation
   - Patterns like "my name is [Name]" are recognized

3. **Order Extraction**:
   - When call ends, system analyzes entire conversation
   - Uses multiple methods to extract items and quantities:
     - Regex pattern matching (e.g., "two burgers")
     - Direct menu item matching
     - Modifier detection (e.g., "with ketchup")

4. **Order Submission**:
   - Structured order data is sent to MCP server
   - Format:
     ```json
     {
       "customer_name": "John Smith",
       "items": [
         {
           "name": "Rebel Burger",
           "quantity": 2,
           "modifiers": ["extra cheese", "no onions"]
         },
         {
           "name": "Fries",
           "quantity": 1,
           "modifiers": []
         }
       ]
     }
     ```

5. **Square Integration**:
   - MCP server matches items to Square catalog
   - Creates order in Square sandbox
   - Returns order ID and confirmation

## API Endpoint

The main API endpoint for order creation:

- **URL**: http://localhost:5000/api/create_order
- **Method**: POST
- **Body**:
  ```json
  {
    "customer_name": "Customer Name",
    "items": [
      {
        "name": "Item Name",
        "quantity": 1,
        "modifiers": ["Modifier 1", "Modifier 2"]
      }
    ]
  }
  ```

## Testing

- Look for orders in the Square Sandbox Dashboard
- Check server logs for order creation details
- Use the "Create Test Order" button for quick testing

## Webhook Support

The MCP server also provides webhook endpoints for Square notifications:

- `/webhooks/order-created` - Receives notifications when orders are created
- `/webhooks/order-updated` - Receives notifications when orders are updated
- `/webhooks/fulfillment-updated` - Receives notifications when fulfillment status changes

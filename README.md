# Burger Rebellion Voice Ordering Demo

A web application that uses the ElevenLabs Conversational Voice Widget to allow customers to place voice orders directly to Square POS using serverless functions on Netlify.

## Deployment Options

This application can be deployed in two ways:

### Option 1: Netlify Deployment (Recommended)

1. **Fork/Clone the Repository**
   
   Make sure you have a GitHub account and fork/clone this repository.

2. **Set Up Environment Variables in Netlify**

   In your Netlify dashboard, add the following environment variables:
   - `SQUARE_ACCESS_TOKEN`: Your Square API Access Token
   - `LOCATION_ID`: Your Square Location ID
   - `NODE_ENV`: Set to `production`

3. **Deploy to Netlify**

   Connect your GitHub repository to Netlify and deploy. The build settings are already configured in the `netlify.toml` file.

### Option 2: Local Development

1. **Configure Environment Variables**
   
   Create a `.env` file based on the `.env.sample` template:
   ```
   SQUARE_ACCESS_TOKEN=your_square_sandbox_access_token
   LOCATION_ID=your_square_location_id
   NODE_ENV=development
   ```

   Alternatively, use the existing `mcp_config.json` file with your Square credentials.

2. **Install Dependencies**
   
   Install the required Node.js dependencies:

   ```
   npm install
   npm install -g netlify-cli
   ```

3. **Start the Development Server**
   
   Run the Netlify development server:

   ```
   netlify dev
   ```

   This will start the local development server with your serverless functions.

4. **Open the Web Application**
   
   The Netlify CLI will automatically open your browser, or you can navigate to:
   
   ```
   http://localhost:8888
   ```

## ElevenLabs Integration

### Setting Up the ElevenLabs Webhook

When your Netlify site is deployed, you'll need to configure the ElevenLabs Webhook:

1. Log into your ElevenLabs account and create a new voice assistant
2. Add a Webhook tool with the following configuration:
   - **Name**: `SubmitOrderToSquare`
   - **Method**: `POST`
   - **URL**: `https://your-netlify-site.netlify.app/api/create-order`
   - **Body Parameters**: Configure the customer_name and items array

```json
{
  "customer_name": "{{customer_name}}",
  "items": [
    {
      "name": "{{item_name}}",
      "quantity": {{quantity}},
      "modifiers": ["{{modifier_1}}", "{{modifier_2}}"]
    }
  ]
}
```

3. In the webhook description, provide instructions for the AI to extract order information from conversations

## How It Works

1. The ElevenLabs widget allows customers to speak their order (e.g., "One Rebel Burger and a Coke").
2. The application matches the spoken items to the Square catalog.
3. The order is submitted to the Square POS system automatically.
4. The widget confirms the order with a thank you message.
5. The conversation ends automatically after the order is confirmed.

## Integration Points

- **ElevenLabs Widget**: Handles the voice conversation with the customer
- **Square API**: Provides the menu and processes the order
- **MCP**: Middleware that facilitates the connection between the widget and Square

## Files

- `index.html`: Main HTML file with the embedded widget
- `main.js`: JavaScript logic for processing orders and integrating with Square
- `mcp_config.json`: Configuration file for MCP servers and environment variables

## Customization

To add additional menu items or modify the order flow, you will need to:

1. Update the Square catalog in your Square dashboard
2. The application will automatically fetch the updated catalog items

## Troubleshooting

- Ensure your Square API token has the necessary permissions for catalog access and order creation
- Check browser console for any error messages
- Verify that your Square Location ID is correct

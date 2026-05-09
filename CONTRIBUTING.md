# Contributing to TeleGallery

Thank you for your interest in contributing to TeleGallery!

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/telegallery.git
   cd telegallery
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   TeleGallery requires a Telegram API ID and Hash.
   - Go to [my.telegram.org](https://my.telegram.org) to register your app and get these credentials.
   - Copy the `.env.example` file to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Add your `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` to the `.env` file.
   - **Important:** Never commit your `.env` file or leak your API credentials!

4. **Run the App in Development Mode**
   ```bash
   npm run dev
   ```

## Development Guidelines

- **Security First:** Always validate IPC inputs. Never use `nodeIntegration: true`.
- **Formatting:** We use Prettier and ESLint. Please ensure your code passes linting before submitting a PR.
- **Commit Messages:** Try to be descriptive about *why* a change was made.

We welcome pull requests!

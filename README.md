# No-Loss Auction Protocol

A decentralized no-loss auction system built on Stellar using Soroban smart contracts.

## Features

- **Create Auction**: Initialize new auctions with custom parameters (title, deadline, minimum bid)
- **Place Bids**: Bid on auctions using SEP-41 tokens with automatic refund of previous highest bidder
- **Track Highest Bidder**: Real-time tracking of the current highest bid and bidder
- **Automatic Refunds**: Previous highest bidders are automatically refunded when outbid
- **Finalize Auction**: Close auctions after deadline and transfer highest bid to owner
- **Cancel Auction**: Cancel auctions only if no bids have been placed

## Smart Contract

### Contract ID (Testnet)
```
CAMAT73RIVOOT64IVRK2XNDR2RYXPY43BFDUPWL3CCS2KU7XSDJRFYLW
```

### Network
- **Network**: Stellar Testnet
- **RPC URL**: https://soroban-testnet.stellar.org
- **Network Passphrase**: Test SDF Network ; September 2015

### Native Token Contract ID
```
CDLZFC3SYJYDZT7K67VZ75HPJGWG362243LX6V57J56VKAB2RGLN65NF
```

## Frontend

### Deployed Frontend
The frontend is deployed and available at: [Coming Soon - Deploying to GitHub Pages]

### Tech Stack
- **React 19**: UI framework
- **Vite**: Build tool and dev server
- **@stellar/stellar-sdk**: Stellar SDK for blockchain interactions
- **Soroban**: Stellar smart contract platform

## Project Structure

```
.
├── contracts/
│   └── no-loss-auction/
│       └── src/
│           └── lib.rs          # Soroban smart contract
├── frontend/
│   ├── src/
│   │   ├── components/         # React components
│   │   │   ├── CreateAuction.jsx
│   │   │   ├── PlaceBid.jsx
│   │   │   ├── AuctionState.jsx
│   │   │   └── AuctionActions.jsx
│   │   ├── App.jsx            # Main application
│   │   ├── contract.js        # Contract integration utilities
│   │   └── contract-config.json # Contract configuration
│   └── package.json
├── scripts/                   # Deployment scripts
└── wasm/                      # Compiled contract WASM
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Rust (for contract development)

### Install Dependencies

```bash
# Install contract dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
```

### Run Frontend Locally

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Build Frontend

```bash
cd frontend
npm run build
```

## Smart Contract Functions

### `initialize(owner, token, title, deadline, min_bid)`
Initialize a new auction with the specified parameters.

### `bid(bidder, amount)`
Place a bid on the auction. Automatically refunds the previous highest bidder.

### `finalize()`
Finalize the auction after the deadline has passed. Transfers the highest bid to the owner.

### `cancel()`
Cancel the auction (only possible if no bids have been placed).

### `get_state()`
Retrieve the current state of the auction.

## How It Works

1. **Auction Creation**: The owner creates an auction with a title, deadline, and minimum bid amount
2. **Bidding**: Users place bids using SEP-41 tokens
3. **Automatic Refunds**: When a user is outbid, their previous bid is automatically refunded
4. **Finalization**: After the deadline, the auction can be finalized
5. **Transfer**: The highest bid amount is transferred to the auction owner
6. **Cancellation**: The owner can cancel the auction if no bids have been placed

## Security Features

- No-loss mechanism: All bidders except the final winner are automatically refunded
- Owner-only cancellation: Only the auction owner can cancel, and only if no bids exist
- Deadline enforcement: Bids cannot be placed after the deadline
- Minimum bid enforcement: Bids must meet or exceed the minimum bid requirement

## License

MIT

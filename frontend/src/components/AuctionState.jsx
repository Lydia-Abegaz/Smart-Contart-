import React from 'react';
import { formatAddress, formatTimestamp } from '../contract';

/**
 * AuctionState displays the current state of the auction.
 * It gracefully handles loading, missing data, and fetch errors.
 *
 * Props:
 *   - auctionState: object | null – the auction data returned from the contract
 *   - loading: boolean – true while the async call is in progress
 *   - error: string | null – error message if the fetch failed
 *   - onRetry: () => void – callback to re‑fetch the auction state
 */
function AuctionState({ auctionState, loading, error, onRetry }) {
  // Skeleton UI while loading (premium design)
  if (loading) {
    return (
      <div className="auction-state loading">
        <div className="skeleton title" />
        <div className="skeleton row" />
        <div className="skeleton row" />
        <div className="skeleton row" />
        <div className="skeleton row" />
      </div>
    );
  }

  // Show error with retry button
  if (error) {
    return (
      <div className="auction-state error">
        <p className="error-msg">Unable to load auction state: {error}</p>
        <button className="retry-btn" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  // No data – contract not initialized yet
  if (!auctionState) {
    return <div className="auction-state">No auction state available</div>;
  }

  const status = auctionState?.finalized
    ? 'Finalized'
    : auctionState?.cancelled
    ? 'Cancelled'
    : 'Active';
  const statusClass = auctionState?.finalized
    ? 'finalized'
    : auctionState?.cancelled
    ? 'cancelled'
    : 'active';

  return (
    <div className="auction-state">
      <h2>Auction State</h2>
      <div className="state-info">
        <div className="info-row">
          <span className="label">Title:</span>
          <span className="value">{auctionState?.title || 'Auction'}</span>
        </div>
        <div className="info-row">
          <span className="label">Status:</span>
          <span className={`value status ${statusClass}`}>{status}</span>
        </div>
        <div className="info-row">
          <span className="label">Owner:</span>
          <span className="value">{formatAddress(auctionState?.owner)}</span>
        </div>
        <div className="info-row">
          <span className="label">Token:</span>
          <span className="value">{formatAddress(auctionState?.token)}</span>
        </div>
        <div className="info-row">
          <span className="label">Deadline:</span>
          <span className="value">{formatTimestamp(auctionState?.deadline)}</span>
        </div>
        <div className="info-row">
          <span className="label">Minimum Bid:</span>
          <span className="value">{auctionState?.min_bid}</span>
        </div>
        <div className="info-row">
          <span className="label">Highest Bid:</span>
          <span className="value">{auctionState?.highest_bid}</span>
        </div>
        <div className="info-row">
          <span className="label">Highest Bidder:</span>
          <span className="value">
            {auctionState?.highest_bidder ? formatAddress(auctionState.highest_bidder) : 'None'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default AuctionState;

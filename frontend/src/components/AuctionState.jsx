import { formatAddress, formatTimestamp } from '../contract';

function AuctionState({ auctionState, loading }) {
  if (loading) {
    return <div className="auction-state loading">Loading auction state...</div>;
  }

  if (!auctionState) {
    return <div className="auction-state">No auction state available</div>;
  }

  const status = auctionState.finalized ? 'Finalized' : auctionState.cancelled ? 'Cancelled' : 'Active';
  const statusClass = auctionState.finalized ? 'finalized' : auctionState.cancelled ? 'cancelled' : 'active';

  return (
    <div className="auction-state">
      <h2>Auction State</h2>
      <div className="state-info">
        <div className="info-row">
          <span className="label">Title:</span>
          <span className="value">{auctionState.title}</span>
        </div>
        <div className="info-row">
          <span className="label">Status:</span>
          <span className={`value status ${statusClass}`}>{status}</span>
        </div>
        <div className="info-row">
          <span className="label">Owner:</span>
          <span className="value">{formatAddress(auctionState.owner)}</span>
        </div>
        <div className="info-row">
          <span className="label">Token:</span>
          <span className="value">{formatAddress(auctionState.token)}</span>
        </div>
        <div className="info-row">
          <span className="label">Deadline:</span>
          <span className="value">{formatTimestamp(auctionState.deadline)}</span>
        </div>
        <div className="info-row">
          <span className="label">Minimum Bid:</span>
          <span className="value">{auctionState.min_bid}</span>
        </div>
        <div className="info-row">
          <span className="label">Highest Bid:</span>
          <span className="value">{auctionState.highest_bid}</span>
        </div>
        <div className="info-row">
          <span className="label">Highest Bidder:</span>
          <span className="value">{auctionState.highest_bidder ? formatAddress(auctionState.highest_bidder) : 'None'}</span>
        </div>
      </div>
    </div>
  );
}

export default AuctionState;

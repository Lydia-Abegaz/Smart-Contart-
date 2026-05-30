import { useState } from 'react';
import { finalizeAuction, cancelAuction } from '../contract';

function AuctionActions({ auctionState, onActionComplete }) {
  const [secretKey, setSecretKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFinalize = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await finalizeAuction(secretKey);
      setSuccess('Auction finalized successfully!');
      setSecretKey('');
      
      if (onActionComplete) {
        onActionComplete();
      }
    } catch (err) {
      setError(err.message || 'Failed to finalize auction');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await cancelAuction(secretKey);
      setSuccess('Auction cancelled successfully!');
      setSecretKey('');
      
      if (onActionComplete) {
        onActionComplete();
      }
    } catch (err) {
      setError(err.message || 'Failed to cancel auction');
    } finally {
      setLoading(false);
    }
  };

  if (!auctionState) {
    return null;
  }

  const canFinalize = !auctionState.finalized && !auctionState.cancelled;
  const canCancel = !auctionState.finalized && !auctionState.cancelled && !auctionState.highest_bidder;

  return (
    <div className="auction-actions">
      <h2>Auction Actions</h2>
      
      {auctionState.finalized && (
        <div className="action-info finalized">
          <p>Auction has been finalized</p>
        </div>
      )}
      
      {auctionState.cancelled && (
        <div className="action-info cancelled">
          <p>Auction has been cancelled</p>
        </div>
      )}
      
      {canFinalize && (
        <div className="action-section">
          <h3>Finalize Auction</h3>
          <p className="action-description">
            Finalize the auction after the deadline has passed. The highest bid will be transferred to the owner.
          </p>
          <form onSubmit={handleFinalize}>
            <div className="form-group">
              <label>Owner Secret Key:</label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="S..."
                required
              />
            </div>
            <button type="submit" disabled={loading}>
              {loading ? 'Finalizing...' : 'Finalize Auction'}
            </button>
          </form>
        </div>
      )}
      
      {canCancel && (
        <div className="action-section">
          <h3>Cancel Auction</h3>
          <p className="action-description">
            Cancel the auction (only possible if no bids have been placed).
          </p>
          <form onSubmit={handleCancel}>
            <div className="form-group">
              <label>Owner Secret Key:</label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="S..."
                required
              />
            </div>
            <button type="submit" disabled={loading} className="cancel-btn">
              {loading ? 'Cancelling...' : 'Cancel Auction'}
            </button>
          </form>
        </div>
      )}
      
      {!canCancel && !auctionState.cancelled && (
        <div className="action-info">
          <p>Auction cannot be cancelled because bids have been placed.</p>
        </div>
      )}
      
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
    </div>
  );
}

export default AuctionActions;

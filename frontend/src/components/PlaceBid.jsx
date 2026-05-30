import { useState } from 'react';
import { placeBid } from '../contract';

function PlaceBid({ auctionState, onBidPlaced }) {
  const [secretKey, setSecretKey] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!auctionState) {
    return (
      <div className="place-bid disabled">
        <h2>Place Bid</h2>
        <p>No auction available</p>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const bidAmount = parseInt(amount);
      
      if (bidAmount <= auctionState.highest_bid) {
        throw new Error(`Bid must be greater than current highest bid: ${auctionState.highest_bid}`);
      }
      
      if (bidAmount < auctionState.min_bid) {
        throw new Error(`Bid must be at least minimum bid: ${auctionState.min_bid}`);
      }
      
      await placeBid(secretKey, bidAmount);
      
      setSuccess('Bid placed successfully!');
      setSecretKey('');
      setAmount('');
      
      if (onBidPlaced) {
        onBidPlaced();
      }
    } catch (err) {
      setError(err.message || 'Failed to place bid');
    } finally {
      setLoading(false);
    }
  };

  if (auctionState.finalized || auctionState.cancelled) {
    return (
      <div className="place-bid disabled">
        <h2>Place Bid</h2>
        <p>
          {auctionState.finalized ? 'Auction has been finalized' : 'Auction has been cancelled'}
        </p>
      </div>
    );
  }

  return (
    <div className="place-bid">
      <h2>Place Bid</h2>
      <div className="bid-info">
        <p>Current Highest Bid: <strong>{auctionState.highest_bid}</strong></p>
        <p>Minimum Bid: <strong>{auctionState.min_bid}</strong></p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Secret Key:</label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="S..."
            required
          />
        </div>
        <div className="form-group">
          <label>Bid Amount:</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount must be > current highest bid"
            min={auctionState.highest_bid + 1}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Placing Bid...' : 'Place Bid'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
    </div>
  );
}

export default PlaceBid;

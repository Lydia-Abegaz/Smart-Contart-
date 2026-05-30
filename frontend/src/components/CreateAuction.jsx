import { useState } from 'react';
import { initializeAuction } from '../contract';

function CreateAuction({ onAuctionCreated }) {
  const [secretKey, setSecretKey] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [minBid, setMinBid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Calculate deadline timestamp (current time + hours)
      const deadlineHours = parseInt(deadline);
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + (deadlineHours * 3600);
      
      const minBidAmount = parseInt(minBid);
      
      await initializeAuction(secretKey, tokenAddress, title, deadlineTimestamp, minBidAmount);
      
      setSuccess('Auction created successfully!');
      setSecretKey('');
      setTokenAddress('');
      setTitle('');
      setDeadline('');
      setMinBid('');
      
      if (onAuctionCreated) {
        onAuctionCreated();
      }
    } catch (err) {
      setError(err.message || 'Failed to create auction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-auction">
      <h2>Create New Auction</h2>
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
          <label>Token Contract Address:</label>
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="C..."
            required
          />
        </div>
        <div className="form-group">
          <label>Auction Title:</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Auction"
            required
          />
        </div>
        <div className="form-group">
          <label>Deadline (hours from now):</label>
          <input
            type="number"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            placeholder="24"
            min="1"
            required
          />
        </div>
        <div className="form-group">
          <label>Minimum Bid:</label>
          <input
            type="number"
            value={minBid}
            onChange={(e) => setMinBid(e.target.value)}
            placeholder="100"
            min="0"
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Auction'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
    </div>
  );
}

export default CreateAuction;

import React, { useState, useEffect, useRef } from "react";
import * as StellarSDK from "@stellar/stellar-sdk";
import { isConnected, getPublicKey, signTransaction } from "@stellar/freighter-api";
import { 
  Play, 
  User, 
  Coins, 
  Clock, 
  Shield, 
  RefreshCw, 
  Check, 
  Copy, 
  Plus, 
  ChevronRight, 
  TrendingUp, 
  XCircle, 
  FileText, 
  HelpCircle, 
  LogOut, 
  Sparkles,
  Wallet,
  AlertTriangle,
  History,
  Info
} from "lucide-react";
import contractConfig from "./contract-config.json";
import "./App.css";

const server = new StellarSDK.rpc.Server(contractConfig.rpcUrl);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function App() {
  // Application State
  const [contractState, setContractState] = useState(null);
  const [loadingState, setLoadingState] = useState(true);
  const [walletType, setWalletType] = useState("sandbox"); // 'sandbox' or 'freighter'
  
  // Accounts
  const [sandboxAccounts, setSandboxAccounts] = useState([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [freighterAddress, setFreighterAddress] = useState("");
  const [activeBalance, setActiveBalance] = useState(0);
  
  // Inputs
  const [bidAmount, setBidAmount] = useState("");
  const [initTitle, setInitTitle] = useState("Space Artifact #001");
  const [initDeadlineHours, setInitDeadlineHours] = useState("1");
  const [initMinBid, setInitMinBid] = useState("100");
  
  // UI Helpers
  const [txHistory, setTxHistory] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [toast, setToast] = useState(null);
  const [copiedText, setCopiedText] = useState("");
  const [timeRemaining, setTimeRemaining] = useState({ hours: 0, minutes: 0, seconds: 0, total: 0 });

  // Init local accounts
  useEffect(() => {
    const loadSandboxAccounts = async () => {
      const stored = localStorage.getItem("no_loss_sandbox_accounts");
      let accounts = [];
      if (stored) {
        accounts = JSON.parse(stored);
      } else {
        // Generate default set of sandbox accounts
        const deployerKp = StellarSDK.Keypair.random();
        const aliceKp = StellarSDK.Keypair.random();
        const bobKp = StellarSDK.Keypair.random();
        
        accounts = [
          { name: "Deployer (Seller)", publicKey: deployerKp.publicKey(), secret: deployerKp.secret(), balance: 0 },
          { name: "Alice (Bidder 1)", publicKey: aliceKp.publicKey(), secret: aliceKp.secret(), balance: 0 },
          { name: "Bob (Bidder 2)", publicKey: bobKp.publicKey(), secret: bobKp.secret(), balance: 0 }
        ];
        localStorage.setItem("no_loss_sandbox_accounts", JSON.stringify(accounts));
      }
      setSandboxAccounts(accounts);
      addLog("Loaded Sandbox Accounts. If they are unfunded, use 'Fund Account' to mint test XLM via Friendbot.", "info");
    };
    loadSandboxAccounts();
  }, []);

  // Poll active balance and contract state
  useEffect(() => {
    fetchContractState();
    const interval = setInterval(() => {
      fetchContractState();
      refreshBalances();
    }, 10000);
    return () => clearInterval(interval);
  }, [sandboxAccounts, activeAccountIndex, walletType, freighterAddress]);

  // Handle countdown
  useEffect(() => {
    if (!contractState || !contractState.deadline || contractState.finalized || contractState.cancelled) {
      setTimeRemaining({ hours: 0, minutes: 0, seconds: 0, total: 0 });
      return;
    }

    const updateTimer = () => {
      const deadlineSecs = Number(contractState.deadline);
      const currentSecs = Math.floor(Date.now() / 1000);
      const diff = deadlineSecs - currentSecs;
      
      if (diff <= 0) {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0, total: 0 });
      } else {
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        setTimeRemaining({ hours, minutes, seconds, total: diff });
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [contractState]);

  // Fetch balances
  const refreshBalances = async () => {
    if (walletType === "sandbox" && sandboxAccounts.length > 0) {
      const active = sandboxAccounts[activeAccountIndex];
      const bal = await fetchXlmBalance(active.publicKey);
      setActiveBalance(bal);
      
      // Update local storage balance representation
      const updated = sandboxAccounts.map((acc, i) => {
        if (i === activeAccountIndex) return { ...acc, balance: bal };
        return acc;
      });
      setSandboxAccounts(updated);
    } else if (walletType === "freighter" && freighterAddress) {
      const bal = await fetchXlmBalance(freighterAddress);
      setActiveBalance(bal);
    }
  };

  const getActiveAddress = () => {
    if (walletType === "sandbox" && sandboxAccounts.length > 0) {
      return sandboxAccounts[activeAccountIndex].publicKey;
    }
    return freighterAddress;
  };

  const addLog = (text, type = "info") => {
    setTxHistory(prev => [
      { id: Date.now() + Math.random(), text, type, time: new Date().toLocaleTimeString() },
      ...prev
    ]);
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    showToast(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedText(""), 2000);
  };

  // Fetch Contract State via Simulation
  const fetchContractState = async () => {
    try {
      const dummyPublicKey = "GDWF6ZWYNYLVBI37DAY2E2HIIYEPQEZIVOP2JTSKUSJJIJYCXBTP5NRE";
      const dummyAccount = new StellarSDK.Account(dummyPublicKey, "0");
      
      const tx = new StellarSDK.TransactionBuilder(dummyAccount, {
        fee: "100",
        networkPassphrase: contractConfig.networkPassphrase,
      })
        .addOperation(
          StellarSDK.Operation.invokeContractFunction({
            contract: contractConfig.contractId,
            function: "get_state",
            args: [],
          })
        )
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      
      if (sim.error) {
        // If simulation errors, most likely the contract is uninitialized
        if (sim.error.includes("trapped") || sim.error.includes("InvalidAction")) {
          setContractState({ uninitialized: true });
        } else {
          console.error("Simulation error:", sim.error);
        }
      } else if (sim.results && sim.results[0]) {
        const state = StellarSDK.scValToNative(sim.results[0].retval);
        setContractState(state);
      }
    } catch (e) {
      console.error("Failed to fetch state:", e);
    } finally {
      setLoadingState(false);
    }
  };

  // Fetch XLM Balance using native SAC token balance call simulation
  const fetchXlmBalance = async (address) => {
    try {
      const dummyAccount = new StellarSDK.Account("GDWF6ZWYNYLVBI37DAY2E2HIIYEPQEZIVOP2JTSKUSJJIJYCXBTP5NRE", "0");
      const tx = new StellarSDK.TransactionBuilder(dummyAccount, {
        fee: "100",
        networkPassphrase: contractConfig.networkPassphrase,
      })
        .addOperation(
          StellarSDK.Operation.invokeContractFunction({
            contract: contractConfig.nativeTokenContractId,
            function: "balance",
            args: [StellarSDK.Address.fromString(address).toScVal()],
          })
        )
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if (sim.results && sim.results[0]) {
        const balanceBig = StellarSDK.scValToNative(sim.results[0].retval);
        return Number(balanceBig) / 10000000;
      }
      return 0;
    } catch (e) {
      return 0;
    }
  };

  // Fund Sandbox Account using Friendbot
  const fundSandboxAccount = async (index) => {
    const acc = sandboxAccounts[index];
    setActionLoading(true);
    setActionMessage(`Requesting Friendbot tokens for ${acc.name}...`);
    addLog(`Funding ${acc.name} (${acc.publicKey.substring(0, 8)}...) via Friendbot...`, "info");
    
    try {
      const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(acc.publicKey)}`;
      const response = await fetch(friendbotUrl);
      if (!response.ok) throw new Error("Friendbot funding failed");
      
      await sleep(6000); // wait for ledger close
      const newBal = await fetchXlmBalance(acc.publicKey);
      
      const updated = sandboxAccounts.map((a, i) => {
        if (i === index) return { ...a, balance: newBal };
        return a;
      });
      setSandboxAccounts(updated);
      if (index === activeAccountIndex) {
        setActiveBalance(newBal);
      }
      
      addLog(`Account ${acc.name} funded successfully! Balance: ${newBal} XLM`, "success");
      showToast(`${acc.name} funded!`);
    } catch (e) {
      addLog(`Funding failed: ${e.message}`, "error");
      showToast("Funding failed!", "error");
    } finally {
      setActionLoading(false);
      setActionMessage("");
    }
  };

  // Create new Sandbox Account
  const createSandboxAccount = () => {
    const kp = StellarSDK.Keypair.random();
    const name = prompt("Enter account name:", `Bidder ${sandboxAccounts.length}`);
    if (!name) return;

    const newAcc = {
      name,
      publicKey: kp.publicKey(),
      secret: kp.secret(),
      balance: 0
    };
    
    const updated = [...sandboxAccounts, newAcc];
    setSandboxAccounts(updated);
    localStorage.setItem("no_loss_sandbox_accounts", JSON.stringify(updated));
    showToast(`Sandbox account "${name}" created!`);
    addLog(`Created new sandbox account: ${name}`, "info");
  };

  // Connect Freighter
  const connectFreighter = async () => {
    try {
      const connected = await isConnected();
      if (!connected) {
        showToast("Freighter not detected!", "error");
        addLog("Freighter wallet not detected in browser extensions.", "error");
        return;
      }
      
      const pubKey = await getPublicKey();
      setFreighterAddress(pubKey);
      setWalletType("freighter");
      showToast("Freighter wallet connected!");
      addLog(`Connected Freighter wallet: ${pubKey}`, "success");
    } catch (e) {
      showToast("Connection failed!", "error");
      console.error(e);
    }
  };

  // Handle Transaction Submission
  const submitTransaction = async (methodName, methodArgs, desc) => {
    setActionLoading(true);
    setActionMessage(`Preparing and simulating ${methodName} transaction...`);
    addLog(`Submitting transaction: ${desc}...`, "info");
    
    try {
      let txResult;
      
      if (walletType === "sandbox") {
        const active = sandboxAccounts[activeAccountIndex];
        const keypair = StellarSDK.Keypair.fromSecret(active.secret);
        
        let account;
        try {
          account = await server.getAccount(active.publicKey);
        } catch (e) {
          throw new Error("Sender account not funded. Please click 'Fund' first!");
        }

        let tx = new StellarSDK.TransactionBuilder(account, {
          fee: "200000",
          networkPassphrase: contractConfig.networkPassphrase,
        })
          .addOperation(
            StellarSDK.Operation.invokeContractFunction({
              contract: contractConfig.contractId,
              function: methodName,
              args: methodArgs,
            })
          )
          .setTimeout(120)
          .build();

        tx = await server.prepareTransaction(tx);
        tx.sign(keypair);

        setActionMessage("Submitting signed transaction to Stellar Testnet...");
        const sendResp = await server.sendTransaction(tx);
        if (sendResp.status === "ERROR") {
          throw new Error(`RPC send error: ${JSON.stringify(sendResp.errorResultXdr)}`);
        }
        
        txResult = await pollTransactionResult(sendResp.hash);
      } else {
        // Freighter
        if (!freighterAddress) throw new Error("Freighter not connected!");
        
        const account = await server.getAccount(freighterAddress);
        let tx = new StellarSDK.TransactionBuilder(account, {
          fee: "200000",
          networkPassphrase: contractConfig.networkPassphrase,
        })
          .addOperation(
            StellarSDK.Operation.invokeContractFunction({
              contract: contractConfig.contractId,
              function: methodName,
              args: methodArgs,
            })
          )
          .setTimeout(120)
          .build();

        tx = await server.prepareTransaction(tx);
        
        setActionMessage("Requesting signature from Freighter extension...");
        const signedXdr = await signTransaction(tx.toXDR(), { network: "TESTNET" });
        const signedTx = StellarSDK.TransactionBuilder.fromXDR(signedXdr, contractConfig.networkPassphrase);
        
        setActionMessage("Submitting signed transaction to Stellar Testnet...");
        const sendResp = await server.sendTransaction(signedTx);
        if (sendResp.status === "ERROR") {
          throw new Error(`RPC send error: ${JSON.stringify(sendResp.errorResultXdr)}`);
        }
        
        txResult = await pollTransactionResult(sendResp.hash);
      }
      
      addLog(`Transaction succeeded! Hash: ${txResult.hash.substring(0, 16)}...`, "success");
      showToast(`${methodName} completed successfully!`);
      
      // Refresh app data
      await fetchContractState();
      await refreshBalances();
    } catch (e) {
      console.error(e);
      addLog(`Transaction failed: ${e.message}`, "error");
      showToast(`Action failed: ${e.message.substring(0, 50)}...`, "error");
    } finally {
      setActionLoading(false);
      setActionMessage("");
    }
  };

  const pollTransactionResult = async (hash) => {
    setActionMessage("Transaction pending. Waiting for ledger close...");
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      try {
        const getTx = await fetch(contractConfig.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: { hash },
          }),
        });
        const res = await getTx.json();
        
        if (res.result) {
          if (res.result.status === "SUCCESS") {
            return { status: "SUCCESS", hash, raw: res.result };
          } else if (res.result.status === "FAILED") {
            throw new Error(`Ledger execution failed. Result XDR: ${res.result.resultXdr}`);
          }
        }
      } catch (err) {
        console.warn(`Polling attempt ${i+1} failed:`, err);
      }
    }
    throw new Error("Transaction verification timed out. It may still succeed in the background.");
  };

  // Actions
  const handleInitialize = () => {
    const activeAddr = getActiveAddress();
    const tokenAddr = contractConfig.nativeTokenContractId;
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + (parseFloat(initDeadlineHours) * 3600);
    const minBidStroops = parseFloat(initMinBid) * 10000000;

    const args = [
      StellarSDK.Address.fromString(activeAddr).toScVal(),
      StellarSDK.Address.fromString(tokenAddr).toScVal(),
      StellarSDK.nativeToScVal(initTitle),
      new StellarSDK.ScInt(deadlineTimestamp, { type: "u64" }).toScVal(),
      new StellarSDK.ScInt(minBidStroops, { type: "i128" }).toScVal(),
    ];

    submitTransaction("initialize", args, `Initialize auction "${initTitle}" with min bid ${initMinBid} XLM`);
  };

  const handlePlaceBid = () => {
    if (!bidAmount || isNaN(bidAmount)) {
      showToast("Enter a valid bid amount!", "error");
      return;
    }

    const activeAddr = getActiveAddress();
    const bidStroops = parseFloat(bidAmount) * 10000000;

    const args = [
      StellarSDK.Address.fromString(activeAddr).toScVal(),
      new StellarSDK.ScInt(bidStroops, { type: "i128" }).toScVal(),
    ];

    submitTransaction("bid", args, `Place bid of ${bidAmount} XLM from ${activeAddr.substring(0, 8)}...`);
    setBidAmount("");
  };

  const handleCancel = () => {
    if (window.confirm("Are you sure you want to cancel the auction?")) {
      submitTransaction("cancel", [], "Cancel the active auction");
    }
  };

  const handleFinalize = () => {
    submitTransaction("finalize", [], "Finalize the auction and transfer winning bid");
  };

  return (
    <div className="app-container">
      {/* Toast Alert */}
      {toast && (
        <div className={`toast toast-${toast.type} animate-fadeIn`}>
          {toast.type === "success" ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <Sparkles className="text-purple-400" size={32} style={{ color: "#a78bfa" }} />
          <div>
            <h1 className="brand-title">No-Loss Space Auction</h1>
            <span className="brand-subtitle">Soroban Smart Contract Dashboard - Stellar Testnet</span>
          </div>
        </div>
        
        {/* Wallet Switcher */}
        <div className="glass-card" style={{ padding: "0.75rem 1.25rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: "500" }}>WALLET:</span>
          <button 
            className={`btn ${walletType === "sandbox" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
            onClick={() => { setWalletType("sandbox"); refreshBalances(); }}
          >
            <User size={14} /> Sandbox
          </button>
          <button 
            className={`btn ${walletType === "freighter" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
            onClick={connectFreighter}
          >
            <Wallet size={14} /> Freighter
          </button>
        </div>
      </header>

      {/* Main Grid Dashboard */}
      <div className="grid-dashboard">
        
        {/* Left Side: Auction Details & Admin Control */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          {/* Card: Active Wallet Info */}
          <div className="glass-card">
            <div style={{ display: "flex", justifyContent: "between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ textAlign: "left" }}>
                <span className="detail-label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <Shield size={12} /> Active Signer ({walletType === "sandbox" ? "Sandbox Account" : "Freighter"})
                </span>
                <h3 style={{ fontSize: "1.25rem", color: "white", marginTop: "0.25rem" }}>
                  {walletType === "sandbox" && sandboxAccounts.length > 0 ? sandboxAccounts[activeAccountIndex].name : "Freighter Account"}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.2rem" }}>
                  <code style={{ fontSize: "0.8rem", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    {getActiveAddress()}
                  </code>
                  <button className="copy-btn" onClick={() => handleCopy(getActiveAddress(), "Address")}>
                    {copiedText === getActiveAddress() ? <Check size={14} style={{ color: "var(--accent-green)" }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <span className="detail-label">Balance</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "flex-end" }}>
                  <Coins size={18} style={{ color: "#fbbf24" }} />
                  <span style={{ fontSize: "1.75rem", fontWeight: "700", color: "white" }}>{activeBalance.toFixed(4)}</span>
                  <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>XLM</span>
                </div>
                {walletType === "sandbox" && (
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", marginTop: "0.25rem" }}
                    onClick={() => fundSandboxAccount(activeAccountIndex)}
                    disabled={actionLoading}
                  >
                    Fund via Friendbot
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card: Auction State Details */}
          <div className="glass-card">
            {loadingState ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "3rem" }}>
                <div className="spinner"></div>
                <span style={{ color: "var(--text-secondary)" }}>Querying Soroban contract state...</span>
              </div>
            ) : contractState?.uninitialized ? (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <AlertTriangle size={48} style={{ color: "#fbbf24", margin: "0 auto 1rem" }} />
                <h2>Auction Uninitialized</h2>
                <p style={{ color: "var(--text-secondary)", margin: "0.5rem 0 1.5rem" }}>
                  The smart contract is deployed to the network but has not been initialized with auction settings.
                </p>
                <div className="glass-card" style={{ background: "rgba(255, 255, 255, 0.02)", textAlign: "left", maxWidth: "600px", margin: "0 auto" }}>
                  <h3 style={{ marginBottom: "1rem" }}>Initialize Auction Settings</h3>
                  <div className="input-group">
                    <label>Auction Title</label>
                    <input className="input-field" value={initTitle} onChange={e => setInitTitle(e.target.value)} />
                  </div>
                  <div className="grid-details" style={{ marginTop: 0, marginBottom: "1.25rem" }}>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label>Duration (Hours)</label>
                      <input className="input-field" type="number" min="0.1" step="0.1" value={initDeadlineHours} onChange={e => setInitDeadlineHours(e.target.value)} />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label>Minimum Bid (XLM)</label>
                      <input className="input-field" type="number" min="0" value={initMinBid} onChange={e => setInitMinBid(e.target.value)} />
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleInitialize} disabled={actionLoading}>
                    Initialize Smart Contract
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "1rem" }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <h2 style={{ fontSize: "1.75rem", color: "white" }}>{contractState.title}</h2>
                      {contractState.cancelled ? (
                        <span className="status-badge status-cancelled">Cancelled</span>
                      ) : contractState.finalized ? (
                        <span className="status-badge status-finalized">Finalized</span>
                      ) : timeRemaining.total === 0 ? (
                        <span className="status-badge status-pending">Ended (Pending Close)</span>
                      ) : (
                        <span className="status-badge status-active">
                          <span className="pulse-dot"></span> Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid-details">
                  <div className="detail-item" style={{ textAlign: "left" }}>
                    <span className="detail-label">Current Highest Bid</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                      <span style={{ fontSize: "2rem", fontWeight: "800", color: "var(--accent-pink)" }}>
                        {(Number(contractState.highest_bid) / 10000000).toFixed(2)}
                      </span>
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>XLM</span>
                    </div>
                  </div>

                  <div className="detail-item" style={{ textAlign: "left" }}>
                    <span className="detail-label">Highest Bidder Address</span>
                    {contractState.highest_bidder ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                        <code className="detail-value-mono">{contractState.highest_bidder.substring(0, 14)}...</code>
                        <button className="copy-btn" onClick={() => handleCopy(contractState.highest_bidder, "Bidder")}>
                          <Copy size={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="detail-value" style={{ color: "var(--text-muted)" }}>No bids yet</span>
                    )}
                  </div>

                  <div className="detail-item" style={{ textAlign: "left" }}>
                    <span className="detail-label">Minimum Bid</span>
                    <span className="detail-value">{(Number(contractState.min_bid) / 10000000).toFixed(2)} XLM</span>
                  </div>

                  <div className="detail-item" style={{ textAlign: "left" }}>
                    <span className="detail-label">Time Remaining</span>
                    {!contractState.finalized && !contractState.cancelled && timeRemaining.total > 0 ? (
                      <div className="countdown-box">
                        <div className="countdown-unit">
                          <span className="countdown-number">{timeRemaining.hours.toString().padStart(2, "0")}</span>
                          <span className="countdown-label">Hours</span>
                        </div>
                        <div className="countdown-unit">
                          <span className="countdown-number">{timeRemaining.minutes.toString().padStart(2, "0")}</span>
                          <span className="countdown-label">Mins</span>
                        </div>
                        <div className="countdown-unit">
                          <span className="countdown-number">{timeRemaining.seconds.toString().padStart(2, "0")}</span>
                          <span className="countdown-label">Secs</span>
                        </div>
                      </div>
                    ) : (
                      <span className="detail-value" style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        {contractState.finalized ? "Auction Finalized" : contractState.cancelled ? "Auction Cancelled" : "Deadline Reached"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Interact Panel: Bidding or Admin actions */}
                <div style={{ marginTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1.5rem" }}>
                  {!contractState.finalized && !contractState.cancelled && timeRemaining.total > 0 ? (
                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label>Place a Bid (Amount in XLM)</label>
                        <div style={{ position: "relative" }}>
                          <input 
                            className="input-field" 
                            type="number" 
                            step="any"
                            placeholder={`Min Bid: ${(Math.max(Number(contractState.highest_bid) / 10000000 + 0.001, Number(contractState.min_bid) / 10000000)).toFixed(3)} XLM`}
                            value={bidAmount} 
                            onChange={e => setBidAmount(e.target.value)} 
                          />
                          <span style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>XLM</span>
                        </div>
                      </div>
                      <button className="btn btn-primary" onClick={handlePlaceBid} disabled={actionLoading}>
                        Submit Bid
                      </button>
                    </div>
                  ) : null}

                  {/* Owner Control Actions */}
                  {getActiveAddress() === contractState.owner && (
                    <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
                      {!contractState.finalized && !contractState.cancelled && (
                        <button 
                          className="btn btn-danger"
                          onClick={handleCancel}
                          disabled={actionLoading || contractState.highest_bidder !== null}
                          title={contractState.highest_bidder ? "Cannot cancel once bids are placed" : ""}
                        >
                          Cancel Auction
                        </button>
                      )}

                      {!contractState.finalized && !contractState.cancelled && timeRemaining.total === 0 && (
                        <button 
                          className="btn btn-primary" 
                          style={{ background: "linear-gradient(135deg, #10b981 0%, #3b82f6 100%)", boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)" }}
                          onClick={handleFinalize}
                          disabled={actionLoading}
                        >
                          Finalize Auction & Transfer Funds
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Sandbox Panel & Activity Logs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          {/* Card: Sandbox Bidders Accounts */}
          {walletType === "sandbox" && (
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <User size={18} style={{ color: "var(--accent-purple)" }} /> Sandbox Accounts
                </h3>
                <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={createSandboxAccount}>
                  <Plus size={14} /> New Account
                </button>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem", textAlign: "left" }}>
                Generate mock accounts to test bid competition. Swapping accounts automatically switches active signer credentials.
              </p>
              
              <div className="sandbox-bidders">
                {sandboxAccounts.map((acc, index) => {
                  const isActive = index === activeAccountIndex;
                  return (
                    <div 
                      key={acc.publicKey} 
                      className="bidder-card" 
                      style={{ 
                        borderColor: isActive ? "var(--accent-purple)" : "var(--glass-border)",
                        background: isActive ? "rgba(139, 92, 246, 0.08)" : "rgba(10, 8, 20, 0.4)"
                      }}
                    >
                      <div className="bidder-info">
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span className="bidder-name">{acc.name}</span>
                          {contractState && contractState.owner === acc.publicKey && (
                            <span style={{ fontSize: "0.6rem", background: "rgba(139,92,246,0.2)", color: "#c084fc", padding: "0.1rem 0.3rem", borderRadius: "4px", fontWeight: "600" }}>OWNER</span>
                          )}
                        </div>
                        <span className="bidder-balance">{acc.balance.toFixed(2)} XLM</span>
                      </div>
                      
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button 
                          className="btn btn-secondary"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
                          onClick={() => fundSandboxAccount(index)}
                          disabled={actionLoading}
                        >
                          Fund
                        </button>
                        <button 
                          className={`btn ${isActive ? "btn-primary" : "btn-secondary"}`}
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
                          onClick={() => {
                            setActiveAccountIndex(index);
                            setActiveBalance(acc.balance);
                            showToast(`Switched active signer to ${acc.name}`);
                            addLog(`Act as signer: ${acc.name}`, "info");
                          }}
                        >
                          {isActive ? "Active" : "Use Account"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Card: Contract Details (Wasm Hash / Network ID) */}
          <div className="glass-card" style={{ fontSize: "0.85rem", textAlign: "left" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <Info size={16} style={{ color: "var(--accent-blue)" }} /> Contract Parameters
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Contract Address</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <code style={{ fontSize: "0.75rem" }}>{contractConfig.contractId}</code>
                  <button className="copy-btn" onClick={() => handleCopy(contractConfig.contractId, "Contract ID")}>
                    <Copy size={12} />
                  </button>
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Wasm Hash</span>
                <code style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{contractConfig.wasmHash}</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Network:</span> <strong style={{ color: "white" }}>{contractConfig.network.toUpperCase()}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Token Interface:</span> <strong style={{ color: "white" }}>SEP-41 (XLM)</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Transaction History Log */}
          <div className="glass-card">
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <History size={18} style={{ color: "var(--accent-pink)" }} /> Console / Activity Log
            </h3>
            <div className="log-container">
              {txHistory.length === 0 ? (
                <div style={{ color: "var(--text-muted)", padding: "1.5rem", fontSize: "0.85rem" }}>No activity logged yet. Submit transactions above to trace events.</div>
              ) : (
                txHistory.map(log => (
                  <div key={log.id} className="log-item" style={{ 
                    borderLeft: `2px solid ${log.type === "success" ? "var(--accent-green)" : log.type === "error" ? "var(--accent-red)" : "var(--accent-purple)"}`,
                    paddingLeft: "0.5rem",
                    textAlign: "left"
                  }}>
                    <div className="log-meta">
                      <span style={{ 
                        color: log.type === "success" ? "var(--accent-green)" : log.type === "error" ? "var(--accent-red)" : "var(--text-secondary)",
                        fontWeight: "600",
                        fontSize: "0.75rem"
                      }}>
                        {log.type.toUpperCase()}
                      </span>
                      <span>{log.time}</span>
                    </div>
                    <span className="log-text">{log.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Fullscreen Loading Overlay when executing actions */}
      {actionLoading && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(5, 4, 10, 0.85)",
          backdropFilter: "blur(4px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          zIndex: 100
        }}>
          <div className="spinner" style={{ width: "48px", height: "48px", borderWidth: "4px" }}></div>
          <div style={{ color: "white", fontSize: "1.1rem", fontWeight: "500", maxWidth: "80%", textAlign: "center" }}>
            {actionMessage}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

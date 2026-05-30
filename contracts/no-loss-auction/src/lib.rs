#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, String, Symbol,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionState {
    pub owner: Address,
    pub token: Address,
    pub title: String,
    pub deadline: u64,
    pub min_bid: i128,
    pub highest_bidder: Option<Address>,
    pub highest_bid: i128,
    pub finalized: bool,
    pub cancelled: bool,
}

#[contract]
pub struct NoLossAuctionContract;

#[contractimpl]
impl NoLossAuctionContract {
    pub fn initialize(
        env: Env,
        owner: Address,
        token: Address,
        title: String,
        deadline: u64,
        min_bid: i128,
    ) {
        if env.storage().instance().has(&Symbol::new(&env, "state")) {
            panic!("already initialized");
        }
        if deadline <= env.ledger().timestamp() {
            panic!("deadline must be in the future");
        }
        if min_bid < 0 {
            panic!("minimum bid must be non-negative");
        }

        let state = AuctionState {
            owner,
            token,
            title,
            deadline,
            min_bid,
            highest_bidder: None,
            highest_bid: 0,
            finalized: false,
            cancelled: false,
        };

        env.storage().instance().set(&Symbol::new(&env, "state"), &state);
    }

    pub fn bid(env: Env, bidder: Address, amount: i128) {
        bidder.require_auth();

        let state_key = Symbol::new(&env, "state");
        let mut state: AuctionState = env
            .storage()
            .instance()
            .get(&state_key)
            .expect("contract not initialized");

        if state.finalized {
            panic!("auction already finalized");
        }
        if state.cancelled {
            panic!("auction already cancelled");
        }
        if env.ledger().timestamp() >= state.deadline {
            panic!("auction deadline has passed");
        }

        let current_highest = state.highest_bid;
        if amount <= current_highest {
            panic!("bid amount must be greater than current highest bid");
        }
        if amount < state.min_bid {
            panic!("bid amount must be at least minimum bid");
        }

        let token_client = token::Client::new(&env, &state.token);

        // Transfer bid from bidder to contract
        token_client.transfer(&bidder, &env.current_contract_address(), &amount);

        // Refund previous bidder if exists
        if let Some(prev_bidder) = state.highest_bidder {
            token_client.transfer(&env.current_contract_address(), &prev_bidder, &current_highest);
        }

        // Update state
        state.highest_bidder = Some(bidder);
        state.highest_bid = amount;

        env.storage().instance().set(&state_key, &state);
    }

    pub fn finalize(env: Env) {
        let state_key = Symbol::new(&env, "state");
        let mut state: AuctionState = env
            .storage()
            .instance()
            .get(&state_key)
            .expect("contract not initialized");

        if state.finalized {
            panic!("auction already finalized");
        }
        if state.cancelled {
            panic!("auction already cancelled");
        }
        if env.ledger().timestamp() < state.deadline {
            panic!("auction deadline has not passed yet");
        }

        // If there was a bid, transfer the highest bid to the owner
        if let Some(_) = state.highest_bidder {
            let token_client = token::Client::new(&env, &state.token);
            token_client.transfer(
                &env.current_contract_address(),
                &state.owner,
                &state.highest_bid,
            );
        }

        state.finalized = true;
        env.storage().instance().set(&state_key, &state);
    }

    pub fn cancel(env: Env) {
        let state_key = Symbol::new(&env, "state");
        let mut state: AuctionState = env
            .storage()
            .instance()
            .get(&state_key)
            .expect("contract not initialized");

        state.owner.require_auth();

        if state.finalized {
            panic!("auction already finalized");
        }
        if state.cancelled {
            panic!("auction already cancelled");
        }

        if state.highest_bidder.is_some() {
            panic!("cannot cancel auction after bids have been placed");
        }

        state.cancelled = true;
        env.storage().instance().set(&state_key, &state);
    }

    pub fn get_state(env: Env) -> AuctionState {
        let state_key = Symbol::new(&env, "state");
        env.storage()
            .instance()
            .get(&state_key)
            .expect("contract not initialized")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, String};

    #[test]
    fn test_auction_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let owner = Address::generate(&env);
        let bidder1 = Address::generate(&env);
        let bidder2 = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_contract_id = env.register_stellar_asset_contract(token_admin.clone());
        let token_client = token::Client::new(&env, &token_contract_id);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract_id);

        token_admin_client.mint(&bidder1, &1000);
        token_admin_client.mint(&bidder2, &1000);

        let contract_id = env.register_contract(None, NoLossAuctionContract);
        let auction_client = NoLossAuctionContractClient::new(&env, &contract_id);

        let title = String::from_str(&env, "Test Auction");
        let deadline = 1000;
        let min_bid = 100;
        auction_client.initialize(&owner, &token_contract_id, &title, &deadline, &min_bid);

        let initial_state = auction_client.get_state();
        assert_eq!(initial_state.highest_bid, 0);
        assert_eq!(initial_state.highest_bidder, None);
        assert_eq!(initial_state.finalized, false);

        // Bidder 1 bids 150
        auction_client.bid(&bidder1, &150);

        let state = auction_client.get_state();
        assert_eq!(state.highest_bid, 150);
        assert_eq!(state.highest_bidder, Some(bidder1.clone()));
        assert_eq!(token_client.balance(&bidder1), 850);
        assert_eq!(token_client.balance(&contract_id), 150);

        // Bidder 2 bids 200 (Bidder 1 should be refunded automatically)
        auction_client.bid(&bidder2, &200);

        let state = auction_client.get_state();
        assert_eq!(state.highest_bid, 200);
        assert_eq!(state.highest_bidder, Some(bidder2.clone()));
        assert_eq!(token_client.balance(&bidder1), 1000); // Refunded!
        assert_eq!(token_client.balance(&bidder2), 800);
        assert_eq!(token_client.balance(&contract_id), 200);

        // Fast forward ledger timestamp to close the auction
        env.ledger().with_mut(|ledger| {
            ledger.timestamp = 1001;
        });

        // Finalize the auction
        auction_client.finalize();

        let state = auction_client.get_state();
        assert_eq!(state.finalized, true);
        assert_eq!(token_client.balance(&owner), 200); // Owner gets the bid
        assert_eq!(token_client.balance(&contract_id), 0);
    }

    #[test]
    #[should_panic(expected = "cannot cancel auction after bids have been placed")]
    fn test_cannot_cancel_with_bids() {
        let env = Env::default();
        env.mock_all_auths();

        let owner = Address::generate(&env);
        let bidder = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_contract_id = env.register_stellar_asset_contract(token_admin);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract_id);
        token_admin_client.mint(&bidder, &1000);

        let contract_id = env.register_contract(None, NoLossAuctionContract);
        let auction_client = NoLossAuctionContractClient::new(&env, &contract_id);

        let title = String::from_str(&env, "Cancel Test");
        let deadline = 1000;
        let min_bid = 100;
        auction_client.initialize(&owner, &token_contract_id, &title, &deadline, &min_bid);

        auction_client.bid(&bidder, &150);

        auction_client.cancel();
    }

    #[test]
    fn test_cancel_with_no_bids() {
        let env = Env::default();
        env.mock_all_auths();

        let owner = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_contract_id = env.register_stellar_asset_contract(token_admin);

        let contract_id = env.register_contract(None, NoLossAuctionContract);
        let auction_client = NoLossAuctionContractClient::new(&env, &contract_id);

        let title = String::from_str(&env, "Cancel Test");
        let deadline = 1000;
        let min_bid = 100;
        auction_client.initialize(&owner, &token_contract_id, &title, &deadline, &min_bid);

        auction_client.cancel();

        let state = auction_client.get_state();
        assert_eq!(state.cancelled, true);
    }
}

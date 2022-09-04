// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract JohnnyCoin is ERC721 {
  address public creator;

  constructor() ERC721('Johnny Coin', 'JC'){
    creator = msg.sender;
  }

  modifier onlyCreator() {
    require(tx.origin == creator, 'Only creator can mint to highest bidder');
    _;
  }

  function mint(address payable highestBidder) external onlyCreator {
    _safeMint(highestBidder, 1); // tokenId? = 1
  }
}

contract Bid is Ownable {
  mapping (address => uint256) public bids;
  address payable public highestBidder;
  uint256 public startDate;
  uint256 public endDate;
  uint256 public minBid;
  address public token;

  event BidPlaced (address _bidder, uint256 _amount);
  event BidWon (address _bidder, uint256 _amount);

  constructor(
    uint256 _startDate,
    uint256 _endDate,
    uint256 _minBid,
    address _token
  )
  payable
  {
    require(_startDate > block.timestamp, 'startDate must be in future');
    require(_startDate < _endDate, 'endDate must be after startDate');
    startDate = _startDate;
    endDate = _endDate;
    minBid = _minBid;
    token = _token;
  }

  function deposit(
    uint256 _amount
  )
  private {
    require(msg.value == _amount);
  }

  function withdraw(
    address payable _previousHighestBidder
  )
  private {
    _previousHighestBidder.transfer(bids[_previousHighestBidder]);
  }

  modifier validateBid() {
    require(block.timestamp > startDate, 'bidding not started');
    require(block.timestamp < endDate, 'bidding ended');
    require(msg.value >= minBid, 'minimum bid not reached');
    require(highestBidder == address(0) || msg.value > bids[highestBidder], 'higher bid required');
    _;
  }

  function bid() payable external validateBid {
    address payable _previousHighestBidder = highestBidder;
    highestBidder = payable(msg.sender); // Possibly replace highestBidder variable with function to get highest bidder to save on gas
    bids[msg.sender] = msg.value;

    deposit(msg.value);
    emit BidPlaced(highestBidder, msg.value);
    if (_previousHighestBidder > address(0)) {
      withdraw(_previousHighestBidder);
    }
  }

  function releaseToken() external onlyOwner {
    JohnnyCoin _token = JohnnyCoin(address(token));
    emit BidWon(highestBidder, bids[highestBidder]);
    _token.mint(highestBidder);
  }
}

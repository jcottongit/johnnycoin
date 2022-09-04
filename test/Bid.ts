import { time, loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

interface DeployBidFixture {
  startDate?: number;
  endDate?: number;
  minBid?: number;
  token: string;
}

const ONE_DAY_IN_SECS = 24 * 60 * 60;
const ONE_ETH_IN_WEI = 1_000_000_000;

describe('Bid', function () {
  const deployJohnnyCoinFixture = async () => {
    const [owner, addr1] = await ethers.getSigners();

    const JohnnyCoin = await ethers.getContractFactory('JohnnyCoin');
    const johnnyCoin = await JohnnyCoin.deploy();

    await johnnyCoin.deployed();

    return { owner, addr1, johnnyCoin };
  };

  const deployBidFixture = async (params: DeployBidFixture) => {
    const {
      startDate = await time.latest() + ONE_DAY_IN_SECS,
      endDate,
      minBid = ONE_ETH_IN_WEI,
      token
    } = params;
    const [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const Bid = await ethers.getContractFactory('Bid');
    const bid = await Bid.deploy(startDate, endDate || startDate +  ONE_DAY_IN_SECS, minBid, token);

    await bid.deployed();

    return { owner, addr1, addr2, addr3, bid };
  };

  describe('deployment', function () {
    describe('validations', () => {
      it('should fail if the startTime is not in the future', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const latestTime = await time.latest();
        const Bid = await ethers.getContractFactory('Bid');
        await expect(Bid.deploy(latestTime - ONE_DAY_IN_SECS, latestTime + ONE_DAY_IN_SECS, ONE_ETH_IN_WEI, johnnyCoin.address)).to.be.revertedWith(
          'startDate must be in future'
        );
      });

      it('should fail if the startTime is not before the endDate', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const latestTime = await time.latest();
        const Bid = await ethers.getContractFactory('Bid');
        await expect(Bid.deploy(latestTime + (2 * ONE_DAY_IN_SECS), latestTime + ONE_DAY_IN_SECS, ONE_ETH_IN_WEI, johnnyCoin.address)).to.be.revertedWith(
          'endDate must be after startDate'
        );
      });
    });

    it('should set the correct args', async () => {
      const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
      const startDate = await time.latest() + ONE_DAY_IN_SECS;
      const endDate = startDate + ONE_DAY_IN_SECS;
      const minBid = ONE_ETH_IN_WEI;
      const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, minBid, token: johnnyCoin.address });
      const { owner, bid } = await loadFixture(deployBidFixtureWithArgs);

      expect(await bid.startDate()).to.equal(startDate);
      expect(await bid.endDate()).to.equal(endDate);
      expect(await bid.minBid()).to.equal(minBid);
      expect(await johnnyCoin.creator()).to.equal(owner.address);
    });
  });

  describe('bidding', () => {
    describe('validations', () => {
      it('should revert if bid placed before startDate', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const startDate = await time.latest() + ONE_DAY_IN_SECS;
        const endDate = startDate + ONE_DAY_IN_SECS;
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, token: johnnyCoin.address });
        const { addr1, bid } = await loadFixture(deployBidFixtureWithArgs);

        await expect(bid.connect(addr1).bid()).to.be.revertedWith('bidding not started');
      });

      it('should revert if bid placed after endDate', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const startDate = await time.latest() + ONE_DAY_IN_SECS;
        const endDate = startDate + ONE_DAY_IN_SECS;
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, token: johnnyCoin.address });
        const { addr1, bid } = await loadFixture(deployBidFixtureWithArgs);

        await time.increase(3 * ONE_DAY_IN_SECS);

        await expect(bid.connect(addr1).bid()).to.be.revertedWith('bidding ended');
      });

      it('should revert if bid is lower that minBid', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const startDate = await time.latest() + ONE_DAY_IN_SECS;
        const endDate = startDate + ONE_DAY_IN_SECS;
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, token: johnnyCoin.address });
        const { addr1, bid } = await loadFixture(deployBidFixtureWithArgs);

        await time.increase(ONE_DAY_IN_SECS);

        await expect(bid.connect(addr1).bid({ value: ONE_ETH_IN_WEI / 2 })).to.be.revertedWith('minimum bid not reached');
      });

      it('should revert if bid is lower than highest bid', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const startDate = await time.latest() + ONE_DAY_IN_SECS;
        const endDate = startDate + ONE_DAY_IN_SECS;
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, token: johnnyCoin.address });
        const { addr1, addr2, bid } = await loadFixture(deployBidFixtureWithArgs);

        await time.increase(ONE_DAY_IN_SECS);
        await bid.connect(addr2).bid({ value: 3 * ONE_ETH_IN_WEI });

        await expect(bid.connect(addr1).bid({ value: 2 * ONE_ETH_IN_WEI })).to.be.revertedWith('higher bid required');
      });
    });

    describe('bids', () => {
      it('should place first bid', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const startDate = await time.latest() + ONE_DAY_IN_SECS;
        const endDate = startDate + ONE_DAY_IN_SECS;
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, token: johnnyCoin.address });
        const { addr1, bid } = await loadFixture(deployBidFixtureWithArgs);

        await time.increase(ONE_DAY_IN_SECS);
        expect(await bid.connect(addr1).bid({ value: ONE_ETH_IN_WEI }))
          .to.emit(bid, 'BidPlaced').withArgs(addr1, ONE_ETH_IN_WEI)
          .to.changeEtherBalances([bid, addr1], [ONE_ETH_IN_WEI, - ONE_ETH_IN_WEI]);
        expect(await bid.highestBidder()).to.equal(addr1.address);
        expect(await bid.bids(addr1.address)).to.equal(ONE_ETH_IN_WEI);
      });

      it('should replace original bidder\`s previous highest bid', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const startDate = await time.latest() + ONE_DAY_IN_SECS;
        const endDate = startDate + ONE_DAY_IN_SECS;
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, token: johnnyCoin.address });
        const { addr1, bid } = await loadFixture(deployBidFixtureWithArgs);

        await time.increase(ONE_DAY_IN_SECS);
        await bid.connect(addr1).bid({ value: ONE_ETH_IN_WEI })
        expect(await bid.connect(addr1).bid({ value: 2 * ONE_ETH_IN_WEI }))
          .to.emit(bid, 'BidPlaced').withArgs(addr1, 2 * ONE_ETH_IN_WEI)
          .to.changeEtherBalances([bid, addr1], [ONE_ETH_IN_WEI, - ONE_ETH_IN_WEI]);
        expect(await bid.highestBidder()).to.equal(addr1.address);
        expect(await bid.bids(addr1.address)).to.equal(2 * ONE_ETH_IN_WEI);
      });

      it('should replace competing bidder\`s previous highest bid', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const startDate = await time.latest() + ONE_DAY_IN_SECS;
        const endDate = startDate + ONE_DAY_IN_SECS;
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, token: johnnyCoin.address });
        const { addr1, addr2, bid } = await loadFixture(deployBidFixtureWithArgs);

        await time.increase(ONE_DAY_IN_SECS);
        await bid.connect(addr1).bid({ value: ONE_ETH_IN_WEI })
        expect(await bid.connect(addr2).bid({ value: 2 * ONE_ETH_IN_WEI }))
          .to.emit(bid, 'BidPlaced').withArgs(addr2, 2 * ONE_ETH_IN_WEI)
          .to.changeEtherBalances([bid, addr1, addr2], [ONE_ETH_IN_WEI, ONE_ETH_IN_WEI, - 2 * ONE_ETH_IN_WEI]);
        expect(await bid.highestBidder()).to.equal(addr2.address);
        expect(await bid.bids(addr2.address)).to.equal(2 * ONE_ETH_IN_WEI);
      });
    });
  });

  describe('token transfer', () => {
    describe('validations', async () => {
      it('should revert when mint on JohnnyCoin called by non owner', async () => {
        const { johnnyCoin, addr1 } = await loadFixture(deployJohnnyCoinFixture);

        await expect(johnnyCoin.connect(addr1).mint(addr1.address)).to.be.revertedWith('Only creator can mint to highest bidder');
      });

      it('should revert when releaseToken called by non owner', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ token: johnnyCoin.address });
        const { addr1, bid } = await loadFixture(deployBidFixtureWithArgs);

        await expect(bid.connect(addr1).releaseToken()).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert when releaseToken called and no bids placed', async () => {
        const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
        const deployBidFixtureWithArgs = async () => await deployBidFixture({ token: johnnyCoin.address });
        const { bid } = await loadFixture(deployBidFixtureWithArgs);

        await expect(bid.releaseToken()).to.be.revertedWith('ERC721: mint to the zero address');
      });
    });

    it('transfers token to highest bidder when releaseToken called', async () => {
      const { johnnyCoin } = await loadFixture(deployJohnnyCoinFixture);
      const startDate = await time.latest() + ONE_DAY_IN_SECS;
      const endDate = startDate + ONE_DAY_IN_SECS;
      const deployBidFixtureWithArgs = async () => await deployBidFixture({ startDate, endDate, token: johnnyCoin.address });
      const { addr1, owner, bid } = await loadFixture(deployBidFixtureWithArgs);

      await time.increase(ONE_DAY_IN_SECS);
      await bid.connect(addr1).bid({ value: ONE_ETH_IN_WEI });

      expect(await johnnyCoin.balanceOf(addr1.address)).to.equal(0);
      expect(await bid.releaseToken()).to.emit(bid, 'BidWon').withArgs(addr1.address, ONE_ETH_IN_WEI)
      expect(await johnnyCoin.balanceOf(addr1.address)).to.equal(1);
    });
  });
});

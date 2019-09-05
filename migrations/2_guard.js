// const Guard = artifacts.require("Guard");
const GuardMock = artifacts.require("GuardMock");

module.exports = function (deployer) {
    // deployer.deploy(Guard);
    deployer.deploy(GuardMock);
};

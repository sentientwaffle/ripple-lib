'use strict';
const BigNumber = require('bignumber.js');
const Transaction = require('./transaction').Transaction;
const SHAMap = require('./shamap').SHAMap;
const SHAMapTreeNode = require('./shamap').SHAMapTreeNode;
const SerializedObject = require('./serializedobject').SerializedObject;
const stypes = require('./serializedtypes');
const UInt160 = require('./uint160').UInt160;
const Currency = require('./currency').Currency;

function Ledger() {
  this.ledger_json = {};
}

Ledger.from_json = function(v) {
  const ledger = new Ledger();
  ledger.parse_json(v);
  return ledger;
};

Ledger.space = require('./ledgerspaces');

/**
 * Generate the key for an AccountRoot entry.
 *
 * @param {String|UInt160} accountArg - Ripple Account
 * @return {UInt256}
 */
Ledger.calcAccountRootEntryHash =
Ledger.prototype.calcAccountRootEntryHash = function(accountArg) {
  const account = UInt160.from_json(accountArg);
  const index = new SerializedObject();

  index.append([0, Ledger.space.account.charCodeAt(0)]);
  index.append(account.to_bytes());

  return index.hash();
};

/**
 * Generate the key for an Offer entry.
 *
 * @param {String|UInt160} accountArg - Ripple Account
 * @param {Number} sequence - Sequence number of the OfferCreate transaction
 *   that instantiated this offer.
 * @return {UInt256}
 */
Ledger.calcOfferEntryHash =
Ledger.prototype.calcOfferEntryHash = function(accountArg, sequence) {
  const account = UInt160.from_json(accountArg);
  const index = new SerializedObject();

  index.append([0, Ledger.space.offer.charCodeAt(0)]);
  index.append(account.to_bytes());
  stypes.Int32.serialize(index, sequence);

  return index.hash();
};

/**
 * Generate the key for a RippleState entry.
 *
 * The ordering of the two account parameters does not matter.
 *
 * @param {String|UInt160} _account1 - First Ripple Account
 * @param {String|UInt160} _account2 - Second Ripple Account
 * @param {String|Currency} _currency - The currency code
 * @return {UInt256}
 */
Ledger.calcRippleStateEntryHash =
Ledger.prototype.calcRippleStateEntryHash = function(
    _account1, _account2, _currency) {
  const currency = Currency.from_json(_currency);
  const account1 = UInt160.from_json(_account1);
  const account2 = UInt160.from_json(_account2);

  if (!account1.is_valid()) {
    throw new Error('Invalid first account');
  }
  if (!account2.is_valid()) {
    throw new Error('Invalid second account');
  }
  if (!currency.is_valid()) {
    throw new Error('Invalid currency');
  }

  const swap = account1.greater_than(account2);
  const lowAccount = swap ? account2 : account1;
  const highAccount = swap ? account1 : account2;
  const index = new SerializedObject();

  index.append([0, Ledger.space.rippleState.charCodeAt(0)]);
  index.append(lowAccount.to_bytes());
  index.append(highAccount.to_bytes());
  index.append(currency.to_bytes());

  return index.hash();
};

Ledger.prototype.parse_json = function(v) {
  this.ledger_json = v;
};

Ledger.prototype.calc_tx_hash = function() {
  const tx_map = new SHAMap();

  this.ledger_json.transactions.forEach(function(tx_json) {
    const tx = Transaction.from_json(tx_json);
    const meta = SerializedObject.from_json(tx_json.metaData);

    const data = new SerializedObject();
    stypes.VariableLength.serialize(data, tx.serialize().to_hex());
    stypes.VariableLength.serialize(data, meta.to_hex());
    tx_map.add_item(tx.hash(), data, SHAMapTreeNode.TYPE_TRANSACTION_MD);
  });

  return tx_map.hash();
};

/**
* @param {Object} options - object
*
* @param {Boolean} [options.sanity_test=false] - If `true`, will serialize each
*   accountState item to binary and then back to json before finally
*   serializing for hashing. This is mostly to expose any issues with
*   ripple-lib's binary <--> json codecs.
*
* @return {UInt256} - hash of shamap
*/
Ledger.prototype.calc_account_hash = function(options) {
  const account_map = new SHAMap();
  let erred;

  this.ledger_json.accountState.forEach(function(le) {
    let data = SerializedObject.from_json(le);

    let json;
    if (options && options.sanity_test) {
      try {
        json = data.to_json();
        data = SerializedObject.from_json(json);
      } catch (e) {
        console.log('account state item: ', le);
        console.log('to_json() ', json);
        console.log('exception: ', e);
        erred = true;
      }
    }

    account_map.add_item(le.index, data, SHAMapTreeNode.TYPE_ACCOUNT_STATE);
  });

  if (erred) {
    throw new Error('There were errors with sanity_test'); // all logged above
  }

  return account_map.hash();
};

// see rippled Ledger::updateHash()
Ledger.calculateLedgerHash =
Ledger.prototype.calculateLedgerHash = function(ledgerHeader) {
  const so = new SerializedObject();
  const prefix = 0x4C575200;
  const totalCoins = (new BigNumber(ledgerHeader.total_coins)).toString(16);

  stypes.Int32.serialize(so, Number(ledgerHeader.ledger_index));
  stypes.Int64.serialize(so, totalCoins);
  stypes.Hash256.serialize(so, ledgerHeader.parent_hash);
  stypes.Hash256.serialize(so, ledgerHeader.transaction_hash);
  stypes.Hash256.serialize(so, ledgerHeader.account_hash);
  stypes.Int32.serialize(so, ledgerHeader.parent_close_time);
  stypes.Int32.serialize(so, ledgerHeader.close_time);
  stypes.Int8.serialize(so, ledgerHeader.close_time_resolution);
  stypes.Int8.serialize(so, ledgerHeader.close_flags);

  return so.hash(prefix).to_hex();
};

exports.Ledger = Ledger;

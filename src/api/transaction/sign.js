/* @flow */
'use strict';
const utils = require('./utils');
const core = utils.common.core;
const validate = utils.common.validate;

/**
 * These prefixes are inserted before the source material used to
 * generate various hashes. This is done to put each hash in its own
 * "space." This way, two different types of objects with the
 * same binary data will produce different hashes.
 *
 * Each prefix is a 4-byte value with the last byte set to zero
 * and the first three bytes formed from the ASCII equivalent of
 * some arbitrary string. For example "TXN".
 */
const HASH_TX_ID = 0x54584E00; // 'TXN'

function getKeyPair(secret) {
  return core.Seed.from_json(secret).get_key();
}

function getPublicKeyHex(keypair) {
  return keypair.pubKeyHex();
}

function serialize(txJSON) {
  return core.SerializedObject.from_json(txJSON);
}

function hashSerialization(serialized, prefix) {
  return serialized.hash(prefix || HASH_TX_ID).to_hex();
}

function signingData(txJSON) {
  return core.Transaction.from_json(txJSON).signingData().buffer;
}

function computeSignature(txJSON, keypair) {
  return keypair.signHex(signingData(txJSON));
}

function sign(txJSON: string, secret: string
): {signedTransaction: string; id: string} {
  const tx = JSON.parse(txJSON);
  validate.txJSON(tx);
  validate.secret(secret);

  const keypair = getKeyPair(secret);
  if (tx.SigningPubKey === undefined) {
    tx.SigningPubKey = getPublicKeyHex(keypair);
  }
  tx.TxnSignature = computeSignature(tx, keypair);
  const serialized = serialize(tx);
  return {
    signedTransaction: serialized.to_hex(),
    id: hashSerialization(serialized, HASH_TX_ID)
  };
}

module.exports = sign;

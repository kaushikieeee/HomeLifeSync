package com.homelifesync.elder.util;

import java.security.SecureRandom;

/**
 * Temporary 4-digit pairing code generation.
 *
 * The tablet pairs by entering the elder's device ID PLUS this code, so a
 * random ID alone isn't enough to claim a device. The code rotates on demand
 * ("New code" in the app) and is published to Firebase with a timestamp so a
 * device can verify it's current (see writePairingCode).
 */
public final class PairingCode {

    private PairingCode() {}

    private static final SecureRandom RNG = new SecureRandom();

    /** 1000–9999 so the code always reads as a 4-digit number. */
    public static String generate() {
        return String.valueOf(1000 + RNG.nextInt(9000));
    }

    public static boolean isValid(String code) {
        return code != null && code.matches("^\\d{4}$");
    }
}
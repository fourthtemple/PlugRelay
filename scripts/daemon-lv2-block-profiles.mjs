export function createDaemonLv2BlockProfileSupport({ makeProtocolError }) {
  function validateNativeHostBlockSizeProfile(nativeHost, maxBlockSize) {
    const profile = lv2BlockSizeProfile(nativeHost);
    if (!profile) {
      return;
    }
    if (!isKnownProfile(profile)) {
      throw makeProtocolError("invalid_argument", "LV2 block-size profile is not supported.", {
        blockSizeProfile: profile
      });
    }
    if (requiresPowerOfTwo(profile) && !isPowerOfTwoBlock(maxBlockSize)) {
      throw makeProtocolError("invalid_argument", "LV2 power-of-two block profiles require maxBlockSize to be a power of two.", {
        maxBlockSize
      });
    }
  }

  function validateRenderBlockSizeProfile(instance, requestedFrames, frames) {
    const profile = lv2BlockSizeProfile(instance.nativeHost);
    if (!profile) {
      return;
    }

    const rawFrames = Number(requestedFrames);
    if (!Number.isInteger(rawFrames) || rawFrames !== frames) {
      throw makeProtocolError("invalid_argument", "LV2 block-size profile requires a valid unclamped frame count.", {
        blockSizeProfile: profile
      });
    }
    if (requiresFixed(profile) && frames !== instance.maxBlockSize) {
      throw makeProtocolError("invalid_argument", "LV2 fixed block-size profiles require frames to equal maxBlockSize.", {
        frames,
        maxBlockSize: instance.maxBlockSize
      });
    }
    if (requiresPowerOfTwo(profile) && !isPowerOfTwoBlock(frames)) {
      throw makeProtocolError("invalid_argument", "LV2 power-of-two block profiles require power-of-two frames.", {
        frames
      });
    }
  }

  function validateParameterSampleOffsetForBlockProfile(instance, sampleOffset) {
    const profile = lv2BlockSizeProfile(instance.nativeHost);
    if (profile && sampleOffset > 0) {
      throw makeProtocolError("invalid_argument", "LV2 restricted block-size profiles accept parameter changes only at block boundaries.", {
        blockSizeProfile: profile,
        sampleOffset
      });
    }
  }

  return {
    validateNativeHostBlockSizeProfile,
    validateParameterSampleOffsetForBlockProfile,
    validateRenderBlockSizeProfile
  };
}

function lv2BlockSizeProfile(nativeHost) {
  return nativeHost?.format === "lv2" && typeof nativeHost.blockSizeProfile === "string"
    ? nativeHost.blockSizeProfile
    : undefined;
}

function isKnownProfile(profile) {
  return profile === "fixed" || profile === "power-of-two" || profile === "fixed-power-of-two";
}

function requiresFixed(profile) {
  return profile === "fixed" || profile === "fixed-power-of-two";
}

function requiresPowerOfTwo(profile) {
  return profile === "power-of-two" || profile === "fixed-power-of-two";
}

function isPowerOfTwoBlock(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

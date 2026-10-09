import React, { useEffect, useState } from 'react';
import { AppState, Platform, Text, View, StyleSheet } from 'react-native';
import { authHeaders } from '../services/AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { canRequestAds, adRequestOptions } from '../services/adEligibility';
import { ADS_USE_TEST_UNITS, GOOGLE_AD_UNITS } from '../config/adsConfig';

// No global SDK initialization. This component is mounted only at explicitly
// allowed placements, and loads the SDK only after account eligibility succeeds.
export default function DiscreetAd({ account, guest, premium, optionalInlineAds = false, placement }) {
  const [ready, setReady] = useState(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    let live = true, nativeAd = null, expiryTimer;
    const abort = new AbortController();
    setReady(null);
    if (!account || guest || (premium && !optionalInlineAds) || !foreground) return () => { live = false; };
    const timeout = setTimeout(() => abort.abort(), 12000);
    (async () => {
      const response = await fetch(`${await getBackendBaseUrl()}/api/me/ad-policy`, {
        headers: await authHeaders(), signal: abort.signal,
      });
      if (!response.ok) return;
      const policy = await response.json();
      const permitted = () => live && canRequestAds({ policy, account, guest, localPremium: premium, optionalInlineAds, placement });
      if (!permitted()) return;
      const sdk = require('react-native-google-mobile-ads');
      await sdk.default().setRequestConfiguration({
        maxAdContentRating: sdk.MaxAdContentRating.G,
        tagForChildDirectedTreatment: policy.childDirected === true,
        tagForUnderAgeOfConsent: policy.underAgeOfConsent === true,
      });
      if (!permitted()) return;
      // UMP handles applicable regional consent. No IDFA request or personalized
      // targeting; Meta must remain absent until its separate adult gate exists.
      const consent = await sdk.AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: policy.underAgeOfConsent });
      if (!permitted() || !consent.canRequestAds) return;
      await sdk.default().initialize();
      if (!permitted()) return;
      const format = placement === 'more_banner' ? 'banner' : 'native';
      const unitId = ADS_USE_TEST_UNITS
        ? (format === 'banner' ? sdk.TestIds.BANNER : sdk.TestIds.NATIVE)
        : GOOGLE_AD_UNITS[Platform.OS]?.[format];
      if (!unitId) return;
      if (format === 'native') {
        nativeAd = await sdk.NativeAd.createForAdRequest(unitId, {
          ...adRequestOptions(),
          startVideoMuted: true,
          adChoicesPlacement: sdk.NativeAdChoicesPlacement.TOP_RIGHT,
        });
        if (!permitted()) { nativeAd.destroy(); nativeAd = null; return; }
      }
      expiryTimer = setTimeout(() => { setReady(null); nativeAd?.destroy(); nativeAd = null; },
        Math.max(0, new Date(policy.validUntil).getTime() - Date.now()));
      setReady({ sdk, unitId, nativeAd, account });
    })().catch(() => { /* No ad is preferable to a privacy/eligibility guess. */ })
      .finally(() => clearTimeout(timeout));
    return () => { live = false; abort.abort(); clearTimeout(timeout); clearTimeout(expiryTimer); nativeAd?.destroy(); };
  }, [account, guest, premium, optionalInlineAds, placement, foreground]);
  if (!ready || ready.account !== account || guest || (premium && !optionalInlineAds) || !foreground) return null;
  const { sdk, unitId, nativeAd } = ready;
  if (!nativeAd) return <View style={styles.banner} accessibilityLabel="Advertisement">
    <Text style={styles.label}>Advertisement</Text>
    <View style={styles.bannerCreative}><sdk.BannerAd unitId={unitId} size={sdk.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      requestOptions={adRequestOptions()} onAdFailedToLoad={() => setReady(null)} />
    </View>
  </View>;
  return <sdk.NativeAdView nativeAd={nativeAd} style={styles.native}>
    <Text style={styles.label}>Advertisement</Text>
    {!!nativeAd.advertiser && <sdk.NativeAsset assetType={sdk.NativeAssetType.ADVERTISER}><Text style={styles.advertiser}>{nativeAd.advertiser}</Text></sdk.NativeAsset>}
    <sdk.NativeAsset assetType={sdk.NativeAssetType.HEADLINE}><Text style={styles.title}>{nativeAd.headline}</Text></sdk.NativeAsset>
    <sdk.NativeMediaView style={{ width: '100%', height: 150 }} resizeMode="contain" />
    {!!nativeAd.body && <sdk.NativeAsset assetType={sdk.NativeAssetType.BODY}><Text style={styles.body}>{nativeAd.body}</Text></sdk.NativeAsset>}
    {!!nativeAd.callToAction && <sdk.NativeAsset assetType={sdk.NativeAssetType.CALL_TO_ACTION}><Text style={styles.action}>{nativeAd.callToAction}</Text></sdk.NativeAsset>}
  </sdk.NativeAdView>;
}
const styles = StyleSheet.create({
  // Inline end-of-section placements only: never overlay navigation or tools.
  banner: { alignItems: 'center', marginTop: 32, marginBottom: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5DED5' },
  bannerCreative: { minHeight: 60 },
  // Leave the top-right corner unobstructed for the SDK's AdChoices overlay.
  native: { padding: 16, paddingTop: 40, borderRadius: 16, backgroundColor: '#F4F4F4', marginTop: 32, marginBottom: 16, borderWidth: 1, borderColor: '#E5DED5' },
  label: { fontSize: 12, color: '#555555', marginBottom: 8 },
  advertiser: { fontSize: 12, color: '#555555', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#272633' },
  body: { fontSize: 14, color: '#444444', marginTop: 8 },
  action: { paddingVertical: 12, color: '#493591', fontWeight: '700' },
});

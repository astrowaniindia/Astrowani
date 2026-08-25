import Remedies, { SHOP_TABS } from './Remedies';

/**
 * Wani Shop — the web storefront at shop.astrowani.com.
 *
 * A thin wrapper, not a second copy. It is the same catalogue editor as the app's Remedies
 * section, pointed at the other channel and given the tabs this shop actually sells; every
 * fix to one is a fix to both. What makes them two shops is remedy_items.channel, not two
 * codebases.
 *
 * Items created here are stamped channel 'shop', so they do not appear in the app's Home
 * remedies row. An item marked 'both' — which is every product that predates the split —
 * shows in both sections until somebody assigns it.
 */
export default function WaniShop() {
  return <Remedies channel="shop" tabs={SHOP_TABS} heading="Wani Shop (Web)" />;
}

// These catalog/community fixtures intentionally exercise the existing US market.
// Production first visits without a selected market must not inherit this default.
import {setCurrentMarket} from '../../dist/market-preference.js';
setCurrentMarket('us');

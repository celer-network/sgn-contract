import dva from 'dva';
import createLoading from 'dva-loading';
import { all, fork } from 'redux-saga/effects';
import {
  generateContractsInitialState,
  drizzleReducers,
  drizzleSagas
} from 'drizzle';
import { message } from 'antd';

import contractOptions from './utils/contracts';
import { checkNetworkCompatbility } from './utils/network';
import CELRModel from './models/celr-token';
import DPoSModel from './models/dpos';
import SGNModel from './models/sgn';
import NetworkModel from './models/network';

function* rootSaga() {
  yield all(drizzleSagas.map(saga => fork(saga)));
}

checkNetworkCompatbility();

// 1. Initialize
const app = dva({
  initialState: {
    ...generateContractsInitialState(contractOptions)
  },
  extraReducers: {
    ...drizzleReducers
  },
  onError(err) {
    if (err.resp) {
      message.error(err.resp.msg);
    } else if (err.srv) {
      message.error(err.srv.msg);
    } else {
      message.error(err);
    }
  }
});

// 2. Plugins
app.use(
  createLoading({
    namespace: 'loading'
    // effects: enable effects level loading state
  })
);

// 3. Model
// Moved to router.js
app.model(CELRModel);
app.model(DPoSModel);
app.model(SGNModel);
app.model(NetworkModel);

// 4. Router
app.router(require('./router.js').default);

// 5. Start
app.start('#root');
app._store.runSaga(rootSaga);

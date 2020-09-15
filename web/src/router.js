import React from 'react';
import PropTypes from 'prop-types';
import { withRouter, routerRedux, Switch, Route, Redirect } from 'dva/router';
import Dynamic from 'dva/dynamic';
import { DrizzleProvider } from 'drizzle-react';
import { LoadingContainer } from 'drizzle-react-components';

import App from './App';
import contractOptions from './utils/contracts';

const { ConnectedRouter } = routerRedux;
const LoadingWrapper = withRouter(LoadingContainer);

const redirectToHome = () => <Redirect to="/dpos" />;

function RouterConfig({ history, app }) {
  const DPoS = Dynamic({
    app,
    component: () => import('./routes/dpos')
  });
  const Candidate = Dynamic({
    app,
    component: () => import('./routes/candidate')
  });
  const Govern = Dynamic({
    app,
    component: () => import('./routes/govern')
  });
  const Reward = Dynamic({
    app,
    component: () => import('./routes/reward')
  });

  return (
    <DrizzleProvider options={contractOptions} store={app._store}>
      <ConnectedRouter history={history}>
        <LoadingWrapper>
          <App>
            <Switch>
              <Route exact path="/dpos" component={DPoS} />
              <Route exact path="/govern" component={Govern} />
              <Route exact path="/reward" component={Reward} />
              <Route exact path="/candidate/:id" component={Candidate} />
              <Route exact path="/" render={redirectToHome} />
            </Switch>
          </App>
        </LoadingWrapper>
      </ConnectedRouter>
    </DrizzleProvider>
  );
}

RouterConfig.propTypes = {
  history: PropTypes.object.isRequired
};

export default RouterConfig;

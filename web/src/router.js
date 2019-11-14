import React from 'react';
import PropTypes from 'prop-types';
import { withRouter, routerRedux, Switch, Route, Redirect } from 'dva/router';
import Dynamic from 'dva/dynamic';
import { DrizzleProvider } from 'drizzle-react';
import { LoadingContainer } from 'drizzle-react-components';
import { Spin } from 'antd';

import App from './App';
import contractOptions from './utils/contracts';

const { ConnectedRouter } = routerRedux;
const LoadingWrapper = withRouter(LoadingContainer);

const redirectToHome = () => <Redirect to="/guard" />;

function RouterConfig({ history, app }) {
  const Guard = Dynamic({
    app,
    component: () => import('./routes/guard')
  });
  const Candidate = Dynamic({
    app,
    component: () => import('./routes/auction')
  });

  return (
    <DrizzleProvider options={contractOptions} store={app._store}>
      <ConnectedRouter history={history}>
        <LoadingWrapper loadingComp={Spin}>
          <App>
            <Switch>
              <Route exact path="/guard" component={Guard} />
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

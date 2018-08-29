import React from 'react';
import PropTypes from 'prop-types';

import Login from '../../shared/Login';
import LogoMenu from './LogoMenu';
import NotificationsMenu from './NotificationsMenu';
import InfraMenu from './InfraMenu';
import ReposMenu from './ReposMenu';
import TiersMenu from './TiersMenu';
import FiltersMenu from './FiltersMenu';
import HelpMenu from './HelpMenu';
import SecondaryNavBar from './SecondaryNavBar';

export default class PrimaryNavBar extends React.Component {
  constructor(props) {
    super(props);

    const { $injector } = props;
    this.$rootScope = $injector.get('$rootScope');
    this.ThResultSetStore = $injector.get('ThResultSetStore');
  }

  render() {
    const {
      user, setUser, repos, pinJobs, history,
      updateButtonClick, serverChanged, filterModel, $injector, setCurrentRepoTreeStatus,
    } = this.props;

    console.log('primary nav bar render');
    return (
      <div id="global-navbar-container">
        <div id="th-global-top-nav-panel">
          <nav id="th-global-navbar" className="navbar navbar-dark">
            <div id="th-global-navbar-top">
              <LogoMenu />
              <span className="navbar-right">
                <NotificationsMenu $injector={$injector} />
                <InfraMenu />
                <ReposMenu repos={repos} />
                <TiersMenu
                  recalculateUnclassified={this.ThResultSetStore.recalculateUnclassifiedCounts}
                  filterModel={filterModel}
                />
                <FiltersMenu
                  pinJobs={pinJobs}
                  filterModel={filterModel}
                  recalculateUnclassified={this.ThResultSetStore.recalculateUnclassifiedCounts}
                />
                <HelpMenu />
                <Login
                  user={user}
                  setUser={setUser}
                  $injector={$injector}
                />
              </span>
            </div>
            <SecondaryNavBar
              updateButtonClick={updateButtonClick}
              serverChanged={serverChanged}
              $injector={$injector}
              filterModel={filterModel}
              history={history}
              recalculateUnclassified={this.ThResultSetStore.recalculateUnclassifiedCounts}
              repos={repos}
              setCurrentRepoTreeStatus={setCurrentRepoTreeStatus}
            />
          </nav>
        </div>
      </div>
    );
  }
}

PrimaryNavBar.propTypes = {
  $injector: PropTypes.object.isRequired,
  filterModel: PropTypes.object.isRequired,
  history: PropTypes.object.isRequired,
  repos: PropTypes.array.isRequired,
  updateButtonClick: PropTypes.func.isRequired,
  pinJobs: PropTypes.func.isRequired,
  serverChanged: PropTypes.bool.isRequired,
  setUser: PropTypes.func.isRequired,
  user: PropTypes.object.isRequired,
  setCurrentRepoTreeStatus: PropTypes.func.isRequired,
};

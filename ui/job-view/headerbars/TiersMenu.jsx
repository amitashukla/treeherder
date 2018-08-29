import React from 'react';
import PropTypes from 'prop-types';
import { TIERS } from '../../models/filter';

export default class TiersMenu extends React.Component {
  constructor(props) {
    super(props);
    const { filterModel } = props;

    this.state = {
      shownTiers: TiersMenu.getShownTiers(filterModel),
    };
  }

  // componentDidMount() {
  //   const { filterModel } = this.props;
  //
  //   this.unlistenHistory = history.listen(() => {
  //     this.setState({ shownTiers: TiersMenu.getShownTiers(filterModel) });
  //   });
  // }

  componentWillUnmount() {
    this.unlistenHistory();
  }

  static getShownTiers(filterModel) {
    return filterModel.getFieldFilters().tier || [];
  }

  toggleTier(tier) {
    const { filterModel } = this.props;
    const { shownTiers } = this.state;

    filterModel.toggleFilters('tier', [tier], !shownTiers.includes(tier));
    this.setState({ shownTiers: TiersMenu.getShownTiers(filterModel) });
  }

  render() {
    const { shownTiers } = this.state;

    return (
      <span className="dropdown">
        <span
          id="tierLabel"
          role="button"
          title="Show/hide job tiers"
          data-toggle="dropdown"
          className="btn btn-view-nav btn-sm nav-menu-btn dropdown-toggle"
        >Tiers</span>
        <ul
          className="dropdown-menu checkbox-dropdown-menu"
          role="menu"
        >
          {TIERS.map((tier) => {
            const isOnlyTier = shownTiers.length === 1 && tier === shownTiers[0];
            return (<li key={tier}>
              <div>
                <label
                  title={isOnlyTier ? 'Must have at least one tier selected at all times' : ''}
                  className={`dropdown-item ${isOnlyTier ? 'disabled' : ''}`}
                >
                  <input
                    id="tier-checkbox"
                    type="checkbox"
                    className="mousetrap"
                    disabled={isOnlyTier}
                    checked={shownTiers.includes(tier)}
                    onChange={() => this.toggleTier(tier)}
                  />tier {tier}
                </label>
              </div>
            </li>);
          })}
        </ul>
      </span>

    );
  }
}

TiersMenu.propTypes = {
  filterModel: PropTypes.object.isRequired,
};

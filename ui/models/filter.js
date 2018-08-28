import {
  thDefaultFilterResultStatuses,
  thFailureResults,
  thPlatformMap,
} from '../js/constants';
import { getStatus } from '../helpers/job';
import { getAllUrlParams } from '../helpers/location';
// import { getJobsUrl } from '../helpers/url';

/**
 * This is going to be mostly stateless functions.  But we will have state
 * during the loop for ``showJob``.  That will cache all the current filters
 * and compare against that.
 *
 * I want to change the filter url so that ``filter-resultstatus=`` isn't
 * repeated for each value.  It should have one entry for each filter and be
 * comma separated values.  But we need to support the old format as well,
 * so reading them in, we parse it.  But then we'll update the URL to be the
 * new format.
 *
 * search-str MAY have commas, so we will need to handle that one differently.
 * .
 *
 */

// used with field-filters to determine how to match the value against the
// job field.
const MATCH_TYPE = {
  exactstr: 'exactstr',
  substr: 'substr', // returns true if any values match the substring
  searchStr: 'searchStr', // returns true only if ALL the values match the substring
  choice: 'choice',
};

// choices available for the field filters
export const FIELD_CHOICES = {
  ref_data_name: {
    name: 'buildername/jobname',
    matchType: MATCH_TYPE.substr,
  },
  build_system_type: {
    name: 'build system',
    matchType: MATCH_TYPE.substr,
  },
  job_type_name: {
    name: 'job name',
    matchType: MATCH_TYPE.substr,
  },
  job_type_symbol: {
    name: 'job symbol',
    matchType: MATCH_TYPE.exactstr,
  },
  job_group_name: {
    name: 'group name',
    matchType: MATCH_TYPE.substr,
  },
  job_group_symbol: {
    name: 'group symbol',
    matchType: MATCH_TYPE.exactstr,
  },
  machine_name: {
    name: 'machine name',
    matchType: MATCH_TYPE.substr,
  },
  platform: {
    name: 'platform',
    matchType: MATCH_TYPE.substr,
  },
  tier: {
    name: 'tier',
    matchType: MATCH_TYPE.exactstr,
  },
  failure_classification_id: {
    name: 'failure classification',
    matchType: MATCH_TYPE.choice,
  },
  // text search across multiple fields
  searchStr: {
    name: 'search string',
    matchType: MATCH_TYPE.searchStr,
  },
};

// prefix for all filter query string params
const PREFIX = 'filter-';

// constants for specific types of filters
const CLASSIFIED_STATE = 'classifiedState';
const RESULT_STATUS = 'resultStatus';
const SEARCH_STR = 'searchStr';

const QS_CLASSIFIED_STATE = PREFIX + CLASSIFIED_STATE;
const QS_RESULT_STATUS = PREFIX + RESULT_STATUS;
// const QS_SEARCH_STR = PREFIX + SEARCH_STR;

// default filter values, when a filter is not specified in the query string
const DEFAULTS = {
  resultStatus: thDefaultFilterResultStatuses,
  classifiedState: ['classified', 'unclassified'],
  tier: ['1', '2'],
};

export const NON_FIELD_FILTERS = ['fromchange', 'tochange', 'author',
  'nojobs', 'startdate', 'enddate', 'revision'];

// failure classification ids that should be shown in "unclassified" mode
const UNCLASSIFIED_IDS = [1, 7];

export const TIERS = ['1', '2', '3'];

export const FILTER_GROUPS = {
  failures: thFailureResults.slice(),
  nonfailures: ['success', 'retry', 'usercancel', 'superseded'],
  'in progress': ['pending', 'running'],
};

// searchStr is internally treated as a field filter, but we don't want it
// exposed as such externally.
export const getFieldChoices = function getFieldChoices() {
  const choices = { ...FIELD_CHOICES };

  delete choices.searchStr;
  return choices;
};

// const withPrefix = function withPrefix(field) {
//   return (!field.startsWith(PREFIX) && !NON_FIELD_FILTERS.includes(field)) ? PREFIX + field : field;
// };

const withoutPrefix = function withoutPrefix(field) {
  return field.startsWith(PREFIX) ? field.replace(PREFIX, '') : field;
};

/**
 * Check the array if any elements contain a match for the ``val`` as a
 * substring.  These functions exist so we aren't creating functions
 * in a loop.
 */
const containsSubstr = function containsSubstr(arr, val) {
  return arr.some(arVal => val.includes(arVal));
};

const containsAllSubstr = function containsAllSubstr(arr, val) {
  return arr.every(arVal => val.includes(arVal));
};

const toArray = function toArray(value) {
  if (value === undefined) {
    return value;
  }
  if (!Array.isArray(value)) {
    return [value];
  }
  return value;
};

export default class Filter {
  static getCurrentFilters() {
    const urlEntries = [...getAllUrlParams().entries()];
    console.log('current', urlEntries);

    // group multiple values for the same field into an array of values
    const groupedValues = [...urlEntries].reduce((acc, [field, value]) => (
      field in acc ?
        { ...acc, [field]: [...acc[field], value] } :
        { ...acc, [field]: value.split(',') }
    ), {});
    // filter to only filter values
    const urlValues = Object.entries(groupedValues).reduce((acc, [field, value]) => (
      field.startsWith(PREFIX) ? { ...acc, [withoutPrefix(field)]: value } : acc
    ), {});

    return { ...DEFAULTS, ...urlValues };
  }

  static getNonFilterParams() {
    return [...getAllUrlParams().entries()].reduce((acc, [key, value]) => (
      !key.startsWith(PREFIX) ? { ...acc, [key]: value } : acc
    ), {});
  }

  getFieldFilters() {
    const excludedFilters = [CLASSIFIED_STATE, RESULT_STATUS, SEARCH_STR];

    return Object.entries(this.currentFilters).reduce((acc, [field, values]) => (
      !excludedFilters.includes(field) ? { ...acc, [field]: values } : acc
    ), {});
  }

  constructor(history) {
    this.history = history;
    this.currentFilters = Filter.getCurrentFilters();
    this.nonFilterParams = Filter.getNonFilterParams();

    this.resultStatusFilters = this.currentFilters[RESULT_STATUS];
    this.classifiedStateFilters = this.currentFilters[CLASSIFIED_STATE];
    this.fieldFilters = this.getFieldFilters();
  }

  addFilter(field, value) {
    const currentValue = this.currentFilters[field];
    let newQsVal = null;

    // All filters support multiple values except NON_FIELD_FILTERS.
    if (currentValue) {
      // set the value to an array
      newQsVal = toArray(currentValue);
      newQsVal.push(value);
      this.currentFilters[field] = [...new Set(newQsVal)];
    } else {
      this.currentFilters[field] = [value];
    }

    if (this._matchesDefaults(field, newQsVal)) {
      delete this.currentFilters[field];
    }

    this.pushCurrentFiltersToHistory();
  }

  removeFilter(field, value) {
    // default to just removing the param completely
    let newQsVal = null;

    if (value) {
      const currentValue = this.currentFilters[field];
      if (currentValue && currentValue.length) {
        newQsVal = currentValue.filter(filterValue => (filterValue !== value));
        this.currentFilters[field] = newQsVal;
      }
    }
    this.pushCurrentFiltersToHistory();
  }

  pushCurrentFiltersToHistory() {
    console.log('history', this.history);
    const newFilterParams = Object.entries(this.currentFilters).reduce((acc, [field, value]) => (
      value.length && !this._matchesDefaults(field, value) ?
        { ...acc, [`${PREFIX}${field}`]: value } : acc
    ), {});

    const newParams = new URLSearchParams({ ...this.nonFilterParams, ...newFilterParams }).toString();
    console.log('newParams', newParams);
    this.history.push(`/?${newParams}`);
  }

  replaceFilter(field, value) {
    this.currentFilters[field] = value;
    this.pushCurrentFiltersToHistory();
    // check for existing value
    // $location.search(withPrefix(field), value);
  }

  clearAllFilters() {
    this.currentFilters = {};
    this.pushCurrentFiltersToHistory();
    // const locationSearch = $location.search();
    // _stripFieldFilters(locationSearch);
    // _stripClearableFieldFilters(locationSearch);
    // $timeout(() => $location.search(locationSearch));
  }

  /**
   * reset the non-field (checkbox in the ui) filters to the default state
   * so the user sees everything.  Doesn't affect the field filters.  This
   * is used to undo the call to ``setOnlyUnclassifiedFailures``.
   */
  resetNonFieldFilters() {
    // TODO: Could I just delete these fields?
    // this.currentFilters[RESULT_STATUS] = DEFAULTS[RESULT_STATUS];
    // this.currentFilters[CLASSIFIED_STATE] = DEFAULTS[CLASSIFIED_STATE];
    delete this.currentFilters[RESULT_STATUS];
    delete this.currentFilters[CLASSIFIED_STATE];
    this.pushCurrentFiltersToHistory();

    // const locationSearch = { ...$location.search() };
    // delete locationSearch[QS_RESULT_STATUS];
    // delete locationSearch[QS_CLASSIFIED_STATE];
    // $timeout(() => $location.search(locationSearch));
  }

  /**
   * used mostly for resultStatus doing group toggles
   *
   * @param field
   * @param values - an array of values for the field
   * @param add - true if adding, false if removing
   */
  toggleFilters(field, values, add) {
    const action = add ? this.addFilter : this.removeFilter;
    values.map(value => action(field, value));
    // Don't emit the filter changed state here: we'll
    // do that when the URL change signal gets fired (see
    // the locationChangeSuccess event, above)
  }

  toggleInProgress() {
    this.toggleResultStatuses(['pending', 'running']);
  }

  toggleResultStatuses(resultStatuses) {
    const currentResultStatuses = this.currentFilters[RESULT_STATUS];
    const unchanged = currentResultStatuses.filter(rs => !resultStatuses.includes(rs));
    const toAdd = resultStatuses.filter(rs => !currentResultStatuses.includes(rs));

    this.currentFilters[RESULT_STATUS] = [...unchanged, ...toAdd];
    this.pushCurrentFiltersToHistory();

    // let rsValues = _getFiltersOrDefaults(RESULT_STATUS);
    // if (difference(resultStatuses, rsValues).length === 0) {
    //   rsValues = difference(rsValues, resultStatuses);
    // } else {
    //   rsValues = [...new Set(rsValues.concat(resultStatuses))];
    // }
    // remove all query string params for this field if we match the defaults
    // if (_matchesDefaults(RESULT_STATUS, rsValues)) {
    //   rsValues = null;
    // }
    // $timeout(() => $location.search(QS_RESULT_STATUS, rsValues));
  }

  toggleClassifiedFilter(classifiedState) {
    const func = this.currentFilters[CLASSIFIED_STATE].includes(classifiedState) ?
      this.removeFilter : this.addFilter;
    func(CLASSIFIED_STATE, classifiedState);
  }

  toggleUnclassifiedFailures() {
    if (this._isUnclassifiedFailures()) {
      this.resetNonFieldFilters();
    } else {
      this.setOnlyUnclassifiedFailures();
    }
  }

  /**
   * Set the non-field filters so that we only view unclassified failures
   */
  setOnlyUnclassifiedFailures() {
    this.currentFilters[QS_RESULT_STATUS] = [...thFailureResults];
    this.currentFilters[QS_CLASSIFIED_STATE] = ['unclassified'];
    this.pushCurrentFiltersToHistory();
  }

  /**
   * Set the non-field filters so that we only view superseded jobs
   */
  setOnlySuperseded() {
    this.currentFilters[QS_RESULT_STATUS] = 'superseded';
    this.currentFilters[QS_CLASSIFIED_STATE] = [...DEFAULTS.classifiedState];
    this.pushCurrentFiltersToHistory();
  }

  getClassifiedStateArray() {
    return this.currentFilters[QS_CLASSIFIED_STATE];
  }

  /**
   * Used externally to display the field filters.  Internally, we treat
   * the ``searchStr`` as a field filter, but the we don't want to expose
   * that outside of this class in this function.
   */
  getFieldFiltersArray() {
    return this.fieldFilters;
  }

  getNonFieldFiltersArray() {
    return this.nonFilterParams;
  }

  getResultStatusArray() {
    return this.resultStatusFilters;
  }

  static isJobUnclassifiedFailure(job) {
    return (thFailureResults.includes(job.result) &&
      !this._isJobClassified(job));
  }

  // _getFiltersOrDefaults(field) {
  //   // NON_FIELD_FILTERS are filter params that don't have the prefix
  //   const qsField = NON_FIELD_FILTERS.includes(field) ? withoutPrefix(field) : withPrefix(field);
  //   const qsFieldSearch = $location.search()[qsField];
  //   const filters = (qsFieldSearch === undefined ? undefined : qsFieldSearch.slice());
  //   if (filters) {
  //     return toArray(filters);
  //   } else if (DEFAULTS.hasOwnProperty(withoutPrefix(field))) {
  //     return DEFAULTS[withoutPrefix(field)].slice();
  //   }
  //   return [];
  // }
  //
  /**
   * Whether or not this job should be shown based on the current filters.
   *
   * @param job - the job we are checking against the filters
   */
  showJob(job) {
    // when runnable jobs have been added to a resultset, they should be
    // shown regardless of settings for classified or result state
    const status = getStatus(job);
    if (status !== 'runnable') {
      // test against resultStatus and classifiedState
      if (!this.resultStatusFilters.includes(status)) {
        return false;
      }
      if (!this._checkClassifiedStateFilters(job)) {
        return false;
      }
    }
    // runnable or not, we still want to apply the field filters like
    // for symbol, platform, search str, etc...
    return this._checkFieldFilters(job);
  }

  _checkClassifiedStateFilters(job) {
    const isClassified = this._isJobClassified(job);
    if (!this.classifiedStateFilters.includes('unclassified') && !isClassified) {
      return false;
    }
    // If the filters say not to include classified, but it IS
    // classified, then return false, otherwise, true.
    return !(!this.classifiedStateFilters.includes('classified') && isClassified);
  }

  _checkFieldFilters(job) {
    return Object.entries(this.fieldFilters).every(([field, values]) => {
      let jobFieldValue = this._getJobFieldValue(job, field);

      // If ``job`` does not have this field, then don't filter.
      // Consider it a pass.  i.e.: runnable jobs have no ``tier`` field.
      if (jobFieldValue) {
        // All filter values are stored as lower case strings
        jobFieldValue = String(jobFieldValue).toLowerCase();

        switch (FIELD_CHOICES[field].matchType) {

          case MATCH_TYPE.substr:
            if (!containsSubstr(values, jobFieldValue)) {
              return false;
            }
            break;

          case MATCH_TYPE.searchStr:
            if (!containsAllSubstr(values, jobFieldValue)) {
              return false;
            }
            break;

          case MATCH_TYPE.exactstr:
            if (!values.includes(jobFieldValue)) {
              return false;
            }
            break;

          case MATCH_TYPE.choice:
            if (!values.includes(jobFieldValue)) {
              return false;
            }
            break;
        }
      }
      return true;
    });
  }


  _isJobClassified(job) {
    return !UNCLASSIFIED_IDS.includes(job.failure_classification_id);
  }

  /**
   * Removes field filters from the passed-in locationSearch without
   * actually setting it in the location bar
   */
  // _stripFieldFilters(locationSearch) {
  //   Object.keys(locationSearch).forEach((field) => {
  //     if (_isFieldFilter(field)) {
  //       delete locationSearch[field];
  //     }
  //   });
  //   return locationSearch;
  // }
  //
  // _stripClearableFieldFilters(locationSearch) {
  //   Object.keys(locationSearch).forEach((field) => {
  //     if (_isClearableFilter(field)) {
  //       delete locationSearch[field];
  //     }
  //   });
  //   return locationSearch;
  // }

  // _isFieldFilter(field) {
  //   return field.startsWith(PREFIX) &&
  //     ['resultStatus', 'classifiedState'].indexOf(this.withoutPrefix(field)) === -1;
  // }

  // _isClearableFilter(field) {
  //   return NON_FIELD_FILTERS.indexOf(field) !== -1;
  // }

  /**
   * Get the field from the job.  In most cases, this is very simple.  But
   * this allows for some special cases, like ``platform`` which
   * shows to the user as a different string than what is stored in the job
   * object.
   */
  _getJobFieldValue(job, field) {
    if (field === 'platform') {
      return `${thPlatformMap[job.platform] || job.platform} ${job.platform_option}`;
    } else if (field === SEARCH_STR) {
      // lazily get this to avoid storing redundant information
      return job.getSearchStr();
    }

    return job[field];
  }

  /**
   * check if we're in the state of showing only unclassified failures
   */
  _isUnclassifiedFailures() {
    return (new Set(this.resultStatusFilters) === new Set(thFailureResults) &&
      new Set(this.classifiedStateFilters) === new Set(['unclassified']));
  }

  _matchesDefaults(field, values) {
    const defaults = DEFAULTS[field];

    console.log('matchesDefaults', field, values, defaults);
    return values.length === defaults.length && values.every(v => defaults.includes(v));
    // field = withoutPrefix(field);
    // if (DEFAULTS.hasOwnProperty(field)) {
    //   return values.length === DEFAULTS[field].length &&
    //     intersection(DEFAULTS[field], values).length === DEFAULTS[field].length;
    // }
    // return false;
  }

}

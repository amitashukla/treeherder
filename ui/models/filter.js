import {
  thDefaultFilterResultStatuses,
  thFailureResults,
} from '../js/constants';
import { getStatus } from '../helpers/job';
import { getAllUrlParams } from '../helpers/location';

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
const QS_SEARCH_STR = PREFIX + SEARCH_STR;

// default filter values, when a filter is not specified in the query string
const DEFAULTS = {
  resultStatus: thDefaultFilterResultStatuses,
  classifiedState: ['classified', 'unclassified'],
  tier: ['1', '2'],
};

const NON_FIELD_FILTERS = ['fromchange', 'tochange', 'author',
  'nojobs', 'startdate', 'enddate', 'revision'];

// failure classification ids that should be shown in "unclassified" mode
const UNCLASSIFIED_IDS = [1, 7];

const TIERS = ['1', '2', '3'];

const FILTER_GROUPS = {
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

const withPrefix = function withPrefix(field) {
  return (!field.startsWith(PREFIX) && !NON_FIELD_FILTERS.includes(field)) ? PREFIX + field : field;
};

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
    const urlParams = getAllUrlParams();
    const urlValues = urlParams.entries.reduce((acc, [key, value]) => (
      key.startsWith(PREFIX) ? { ...acc, [withoutPrefix(key)]: value } : acc
    ), {});

    return { ...DEFAULTS, ...urlValues };
  }

  static getFieldFilters(currentFilters) {
    const excludedFilters = [CLASSIFIED_STATE, RESULT_STATUS, SEARCH_STR];

    return Object.entries(currentFilters).reduce((acc, [field, values]) => (
      !excludedFilters.contains(field) ? { ...acc, [field]: values } : acc
    ), {});
  }

  static addFilter(field, value) {
    const currentValue = Filter.getCurrentFilters()[field];
    let newQsVal = null;

    // All filters support multiple values except NON_FIELD_FILTERS.
    if (currentValue) {
      // set the value to an array
      newQsVal = toArray(currentValue);
      newQsVal.push(value);
      newQsVal = [...new Set(newQsVal)];
    } else {
      newQsVal = [value];
    }
    if (_matchesDefaults(field, newQsVal)) {
      newQsVal = null;
    }
    $timeout(() => $location.search(withPrefix(field), newQsVal));
  }

  static removeFilter(field, value) {
    // default to just removing the param completely
    let newQsVal = null;

    if (value) {
      const oldQsVal = _getFiltersOrDefaults(field);
      if (oldQsVal && oldQsVal.length) {
        newQsVal = oldQsVal.filter(filterValue => (filterValue !== value));
      }
      if (!newQsVal || !newQsVal.length || _matchesDefaults(field, newQsVal)) {
        newQsVal = null;
      }
    }
    $timeout(() => $location.search(withPrefix(field), newQsVal));
  }

  static replaceFilter(field, value) {
    // check for existing value
    $location.search(withPrefix(field), value);
  }

  static clearAllFilters() {
    const locationSearch = $location.search();
    _stripFieldFilters(locationSearch);
    _stripClearableFieldFilters(locationSearch);
    $timeout(() => $location.search(locationSearch));
  }

  /**
   * reset the non-field (checkbox in the ui) filters to the default state
   * so the user sees everything.  Doesn't affect the field filters.  This
   * is used to undo the call to ``setOnlyUnclassifiedFailures``.
   */
  static resetNonFieldFilters() {
    const locationSearch = { ...$location.search() };
    delete locationSearch[QS_RESULT_STATUS];
    delete locationSearch[QS_CLASSIFIED_STATE];
    $timeout(() => $location.search(locationSearch));
  }

  /**
   * used mostly for resultStatus doing group toggles
   *
   * @param field
   * @param values - an array of values for the field
   * @param add - true if adding, false if removing
   */
  static toggleFilters(field, values, add) {
    const action = add ? addFilter : removeFilter;
    values.map(value => action(field, value));
    // Don't emit the filter changed state here: we'll
    // do that when the URL change signal gets fired (see
    // the locationChangeSuccess event, above)
  }

  static toggleInProgress() {
    toggleResultStatuses(['pending', 'running']);
  }

  static toggleResultStatuses(resultStatuses) {
    let rsValues = _getFiltersOrDefaults(RESULT_STATUS);
    if (difference(resultStatuses, rsValues).length === 0) {
      rsValues = difference(rsValues, resultStatuses);
    } else {
      rsValues = [...new Set(rsValues.concat(resultStatuses))];
    }
    // remove all query string params for this field if we match the defaults
    if (_matchesDefaults(RESULT_STATUS, rsValues)) {
      rsValues = null;
    }
    $timeout(() => $location.search(QS_RESULT_STATUS, rsValues));
  }

  static toggleClassifiedFilter(classifiedState) {
    const func = getClassifiedStateArray().includes(classifiedState) ? removeFilter : addFilter;
    func('classifiedState', classifiedState);
  }

  static toggleUnclassifiedFailures() {
    if (_isUnclassifiedFailures()) {
      resetNonFieldFilters();
    } else {
      setOnlyUnclassifiedFailures();
    }
  }

  /**
   * Set the non-field filters so that we only view unclassified failures
   */
  static setOnlyUnclassifiedFailures() {
    const locationSearch = { ...$location.search() };
    locationSearch[QS_RESULT_STATUS] = thFailureResults.slice();
    locationSearch[QS_CLASSIFIED_STATE] = ['unclassified'];
    $timeout(() => $location.search(locationSearch));
  }

  /**
   * Set the non-field filters so that we only view superseded jobs
   */
  static setOnlySuperseded() {
    const locationSearch = { ...$location.search() };
    locationSearch[QS_RESULT_STATUS] = 'superseded';
    locationSearch[QS_CLASSIFIED_STATE] = DEFAULTS.classifiedState.slice();
    $timeout(() => $location.search(locationSearch));
  }

  static getClassifiedStateArray() {
    const arr = toArray($location.search()[QS_CLASSIFIED_STATE]) ||
      DEFAULTS.classifiedState;
    return arr.slice();
  }

  /**
   * Used externally to display the field filters.  Internally, we treat
   * the ``searchStr`` as a field filter, but the we don't want to expose
   * that outside of this class in this function.
   */
  static getFieldFiltersArray() {
    const fieldFilters = [];
    Object.entries($location.search()).forEach(([fieldName, values]) => {
      if (_isFieldFilter(fieldName)) {
        const valArr = toArray(values);
        valArr.forEach((val) => {
          if (fieldName !== QS_SEARCH_STR) {
            fieldFilters.push({
                                field: withoutPrefix(fieldName),
                                value: val,
                                key: fieldName,
                              });
          }
        });
      }
    });
    return fieldFilters;
  }

  static getNonFieldFiltersArray() {
    return Object.entries($location.search()).reduce((acc, [key, value]) => (
      NON_FIELD_FILTERS.includes(key) ? [...acc, {
        field: key,
        key,
        value
      }] : acc
    ), []);
  }

  static getResultStatusArray() {
    const arr = toArray($location.search()[QS_RESULT_STATUS]) ||
      DEFAULTS.resultStatus;
    return arr.slice();
  }

  static isJobUnclassifiedFailure(job) {
    return (thFailureResults.indexOf(job.result) !== -1 &&
      !_isJobClassified(job));
  }

  constructor() {
    this.currentFilters = this.getCurrentFilters();

    this.resultStatusFilters = this._getFiltersOrDefaults(RESULT_STATUS);
    this.classifiedStateFilters = this._getFiltersOrDefaults(CLASSIFIED_STATE);
    this.fieldFilters = this.getFieldFilters();
  }

  _getFiltersOrDefaults(field, filterParams) {
    // NON_FIELD_FILTERS are filter params that don't have the prefix
    const qsField = NON_FIELD_FILTERS.includes(field) ? withoutPrefix(field) : withPrefix(field);
    const qsFieldSearch = $location.search()[qsField];
    const filters = (qsFieldSearch === undefined ? undefined : qsFieldSearch.slice());
    if (filters) {
      return toArray(filters);
    } else if (DEFAULTS.hasOwnProperty(withoutPrefix(field))) {
      return DEFAULTS[withoutPrefix(field)].slice();
    }
    return [];
  }

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
      if (resultStatusFilters.indexOf(status) === -1) {
        return false;
      }
      if (!_checkClassifiedStateFilters(job)) {
        return false;
      }
    }
    // runnable or not, we still want to apply the field filters like
    // for symbol, platform, search str, etc...
    return _checkFieldFilters(job);
  }

  _checkClassifiedStateFilters(job) {
    const isClassified = _isJobClassified(job);
    if (!classifiedStateFilters.includes('unclassified') && !isClassified) {
      return false;
    }
    // If the filters say not to include classified, but it IS
    // classified, then return false, otherwise, true.
    return !(!classifiedStateFilters.includes('classified') && isClassified);
  }

  _checkFieldFilters(job) {
    return Object.entries(fieldFilters).every(([field, values]) => {
      let jobFieldValue = _getJobFieldValue(job, field);

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
    return UNCLASSIFIED_IDS.indexOf(job.failure_classification_id) === -1;
  }

  /**
   * Removes field filters from the passed-in locationSearch without
   * actually setting it in the location bar
   */
  _stripFieldFilters(locationSearch) {
    Object.keys(locationSearch).forEach((field) => {
      if (_isFieldFilter(field)) {
        delete locationSearch[field];
      }
    });
    return locationSearch;
  }

  _stripClearableFieldFilters(locationSearch) {
    Object.keys(locationSearch).forEach((field) => {
      if (_isClearableFilter(field)) {
        delete locationSearch[field];
      }
    });
    return locationSearch;
  }

  // _isFieldFilter(field) {
  //   return field.startsWith(PREFIX) &&
  //     ['resultStatus', 'classifiedState'].indexOf(this.withoutPrefix(field)) === -1;
  // }

  _isClearableFilter(field) {
    return NON_FIELD_FILTERS.indexOf(field) !== -1;
  }

  /**
   * Get the field from the job.  In most cases, this is very simple.  But
   * this allows for some special cases, like ``platform`` which
   * shows to the user as a different string than what is stored in the job
   * object.
   */
  _getJobFieldValue(job, field) {
    if (field === 'platform') {
      return thPlatformName(job[field]) + ' ' + job.platform_option;
    } else if (field === 'searchStr') {
      // lazily get this to avoid storing redundant information
      return job.getSearchStr();
    }

    return job[field];
  }

  /**
   * check if we're in the state of showing only unclassified failures
   */
  _isUnclassifiedFailures() {
    return (_.isEqual(toArray($location.search()[QS_RESULT_STATUS]), thFailureResults) &&
      _.isEqual(toArray($location.search()[QS_CLASSIFIED_STATE]), ['unclassified']));
  }

  _matchesDefaults(field, values) {
    field = withoutPrefix(field);
    if (DEFAULTS.hasOwnProperty(field)) {
      return values.length === DEFAULTS[field].length &&
        intersection(DEFAULTS[field], values).length === DEFAULTS[field].length;
    }
    return false;
  }

}

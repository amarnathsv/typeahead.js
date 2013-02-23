/*
 * Twitter Typeahead
 * https://github.com/twitter/typeahead
 * Copyright 2013 Twitter, Inc. and other contributors; Licensed MIT
 */

var TypeaheadView = (function() {
  var html = {
        wrapper: '<span class="twitter-typeahead"></span>',
        hint: '<input class="tt-hint">',
        dropdown: '<span class="tt-dropdown-menu"></span>'
      },
      css = {
        wrapper: {
          position: 'relative',
          display: 'inline-block'
        },
        hint: {
          position: 'absolute',
          top: '0',
          left: '0',
          borderColor: 'transparent',
          boxShadow: 'none'
        },
        query: {
          position: 'relative',
          verticalAlign: 'top',
          backgroundColor: 'transparent',
          // ie6-8 doesn't fire hover and click events for elements with
          // transparent backgrounds, for a workaround, use 1x1 transparent gif
          backgroundImage: 'url(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)'
        },
        dropdown: {
          position: 'absolute',
          top: '100%',
          left: '0',
          // TODO: should this be configurable?
          zIndex: '100',
          display: 'none'
        }
      };

  // ie7 specific styling
  if (utils.isMsie() && utils.isMsie() <= 7) {
    utils.mixin(css.wrapper, { display: 'inline', zoom: '1' });
    // if someone can tell me why this is necessary to align
    // the hint with the query in ie7, i'll send you $5 - @JakeHarding
    utils.mixin(css.query, { marginTop: '-1px' });
  }

  // constructor
  // -----------

  function TypeaheadView(o) {
    utils.bindAll(this);

    this.$node = buildDomStructure(o.input);
    this.datasets = o.datasets;
    this.dir = null;

    // precompile the templates
    utils.each(this.datasets, function(key, dataset) {
      var parentTemplate = '<div class="tt-suggestion">%body</div>';

      if (dataset.template) {
        dataset.template = dataset.engine
        .compile(parentTemplate.replace('%body', dataset.template));
      }

      // if no template is provided, render suggestion
      // as it's value wrapped in a p tag
      else {
        dataset.template = {
          render: function(context) {
            return parentTemplate
            .replace('%body', '<p>' + context.value + '</p>');
          }
        };
      }
    });

    this.inputView = new InputView({
      input: this.$node.find('.tt-query'),
      hint: this.$node.find('.tt-hint')
    });

    this.dropdownView = new DropdownView({
      menu: this.$node.find('.tt-dropdown-menu')
    });

    this.dropdownView
    .on('suggestionSelected', this._handleSelection)
    .on('cursorMoved', this._clearHint)
    .on('cursorMoved', this._setInputValueToSuggestionUnderCursor)
    .on('cursorRemoved', this._setInputValueToQuery)
    .on('cursorRemoved', this._updateHint)
    .on('suggestionsRendered', this._updateHint)
    .on('opened', this._updateHint)
    .on('closed', this._clearHint);

    this.inputView
    .on('focused', this._openDropdown)
    .on('blured', this._closeDropdown)
    .on('blured', this._setInputValueToQuery)
    .on('enterKeyed', this._handleSelection)
    .on('queryChanged', this._clearHint)
    .on('queryChanged', this._clearSuggestions)
    .on('queryChanged', this._getSuggestions)
    .on('whitespaceChanged', this._updateHint)
    .on('queryChanged whitespaceChanged', this._openDropdown)
    .on('queryChanged whitespaceChanged', this._setLanguageDirection)
    .on('escKeyed', this._closeDropdown)
    .on('escKeyed', this._setInputValueToQuery)
    .on('upKeyed downKeyed', this._moveDropdownCursor)
    .on('upKeyed downKeyed', this._openDropdown)
    .on('tabKeyed', this._setPreventDefaultValueForTab)
    .on('tabKeyed leftKeyed rightKeyed', this._autocomplete);
  }

  utils.mixin(TypeaheadView.prototype, EventTarget, {
    // private methods
    // ---------------

    _setPreventDefaultValueForTab: function(e) {
      var hint = this.inputView.getHintValue(),
          inputValue = this.inputView.getInputValue(),
          preventDefault = hint && hint !== inputValue;

      // if the user tabs to autocomplete while the menu is open
      // this will prevent the focus from being lost from the query input
      this.inputView.setPreventDefaultValueForKey('9', preventDefault);
    },

    _setLanguageDirection: function() {
      var dir = this.inputView.getLanguageDirection();

      if (dir !== this.dir) {
        this.dir = dir;
        this.$node.css('direction', dir);
        this.dropdownView.setLanguageDirection(dir);
      }
    },

    _updateHint: function() {
      var dataForFirstSuggestion = this.dropdownView.getFirstSuggestion(),
          hint = dataForFirstSuggestion ? dataForFirstSuggestion.value : null,
          inputValue,
          query,
          beginsWithQuery,
          match;

      if (hint && this.dropdownView.isVisible()) {
        inputValue = this.inputView.getInputValue();
        query = inputValue
        .replace(/\s{2,}/g, ' ') // condense whitespace
        .replace(/^\s+/g, ''); // strip leading whitespace

        beginsWithQuery = new RegExp('^(?:' + query + ')(.*$)', 'i');
        match = beginsWithQuery.exec(hint);

        this.inputView.setHintValue(inputValue + (match ? match[1] : ''));
      }
    },

    _clearHint: function() {
      this.inputView.setHintValue('');
    },

    _clearSuggestions: function() {
      this.dropdownView.clearSuggestions();
    },

    _setInputValueToQuery: function() {
      this.inputView.setInputValue(this.inputView.getQuery());
    },

    _setInputValueToSuggestionUnderCursor: function(e) {
      this.inputView.setInputValue(e.data.value, true);
    },

    _openDropdown: function() {
      this.dropdownView.open();
    },

    _closeDropdown: function(e) {
      this.dropdownView[e.type === 'blured' ?
        'closeUnlessMouseIsOverDropdown' : 'close']();
    },

    _moveDropdownCursor: function(e) {
      this.dropdownView[e.type === 'upKeyed' ?
        'moveCursorUp' : 'moveCursorDown']();
    },

    _handleSelection: function(e) {
      var byClick = e.type === 'suggestionSelected',
          suggestionData = byClick ?
            e.data : this.dropdownView.getSuggestionUnderCursor();

      if (suggestionData) {
        this.inputView.setInputValue(suggestionData.value);

        // if triggered by click, ensure the query input still has focus
        // if trigged by keypress, prevent default browser behavior
        // which is most likely the submisison of a form
        // note: e.data is the jquery event
        byClick ? this.inputView.focus() : e.data.preventDefault();

        // focus is not a synchronous event in ie, so we deal with it
        byClick && utils.isMsie() ?
          setTimeout(this.dropdownView.close, 0) : this.dropdownView.close();
      }
    },

    _getSuggestions: function() {
      var that = this,
          query = this.inputView.getQuery();

      utils.each(this.datasets, function(i, dataset) {
        dataset.getSuggestions(query, function(suggestions) {
          that._renderSuggestions(query, dataset, suggestions);
        });
      });
    },

    _renderSuggestions: function(query, dataset, suggestions) {
      if (query !== this.inputView.getQuery()) { return; }

      suggestions = suggestions.slice(0, dataset.limit);
      this.dropdownView.renderSuggestions(query, dataset, suggestions);
    },

    _autocomplete: function(e) {
      var isCursorAtEnd, ignoreEvent, query, hint;

      if (e.type === 'rightKeyed' || e.type === 'leftKeyed') {
        isCursorAtEnd = this.inputView.isCursorAtEnd();
        ignoreEvent = this.inputView.getLanguageDirection() === 'ltr' ?
          e.type === 'leftKeyed' : e.type === 'rightKeyed';

        if (!isCursorAtEnd || ignoreEvent) { return; }
      }

      query = this.inputView.getQuery();
      hint = this.inputView.getHintValue();

      if (hint !== '' && query !== hint) {
        this.inputView.setInputValue(hint);
      }
    }
  });

  return TypeaheadView;

  function buildDomStructure(input) {
    var $wrapper = $(html.wrapper),
        $dropdown = $(html.dropdown),
        $input = $(input),
        $hint = $(html.hint);

    $wrapper = $wrapper.css(css.wrapper);
    $dropdown = $dropdown.css(css.dropdown);

    $hint
    .attr({
      type: 'text',
      autocomplete: false,
      spellcheck: false,
      disabled: true
    })
    .css(css.hint)
    .css('background', $input.css('background'));

    $input
    .addClass('tt-query')
    .attr({ autocomplete: false, spellcheck: false })
    .css(css.query);

    // ie7 does not like it when dir is set to auto,
    // it does not like it one bit
    try { !$input.attr('dir') && $input.attr('dir', 'auto'); } catch (e) {}

    return $input
    .wrap($wrapper)
    .parent()
    .prepend($hint)
    .append($dropdown);
  }
})();

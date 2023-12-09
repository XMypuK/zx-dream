(function (window, ko, $) {
    "use strict"

    function toNumString(num, base, padding) {
        return (padding + (num || 0).toString(base)).substr(-padding.length).toUpperCase();
    }

    function fromNumString(str, base, mask) {
        var result = parseInt(str, base);
        if (!isNaN(result)) {
            result &= mask;
        }
        return result;
    }

    function NumericBindingHandler(element, valueAccessor, base, digits, padding, mask, allowedKeyCodes) {
        this._element = element;
        this._valueAccessor = valueAccessor;
        this._base = base;
        this._digits = digits;
        this._padding = padding;
        this._mask = mask;
        this._allowedKeyCodes = allowedKeyCodes;
        this._value = undefined;
        this._modified = false;
        this._editingSubscription = undefined;
        this._input = undefined;
        this._initialFocusElement = undefined;
    }
    NumericBindingHandler.prototype = {
        initOrUpdate: function (init) {
            var valueOrObservable = this._valueAccessor();
            var value = undefined;
            var modified = false;
            var editable = false;
            if (ko.isObservable(valueOrObservable)) {
                value = valueOrObservable();
                modified = ko.unwrap(valueOrObservable.modified) || false;
                editable = ko.unwrap(valueOrObservable.editable) || false;
                if (init) {
                    valueOrObservable.editing = ko.observable(false);
                    this._editingSubscription = valueOrObservable.editing.subscribe(this.onEditingChange, this);
                    ko.utils.domNodeDisposal.addDisposeCallback(this._element, this.onElementDispose.bind(this));
                }
            }
            else {
                value = valueOrObservable;
            }

            if (value !== this._value) {
                this._value = value;
                ko.utils.setTextContent(this._element, toNumString(value, this._base, this._padding));
            }
            if (modified !== this._modified) {
                this._modified = modified;
                $(this._element).toggleClass('-modified', !!modified);
            }
            if (!editable && this._input) {
                valueOrObservable.editing(false);
            }
        },
        onEditingChange: function (editing) {
            if (editing)
                this.enterEditing();
            else
                this.leaveEditing();
        },
        enterEditing: function () {
            var observable = this._valueAccessor();
            var editable = observable && ko.unwrap(observable.editable) || false;
            if (!editable || this._input) 
                return;

            this._initialFocusElement = document.activeElement;
            var $element = $(this._element);
            var offset = $element.position();
            var width = $element.innerWidth();
            var height = $element.innerHeight();
            this._input = $('<input type="text" class="hex-edit-control"></input>')
                .css({
                    top: offset.top + 'px',
                    left: offset.left + 'px',
                    width: width + 'px',
                    height: height + 'px'
                })
                .on('blur', function (e) { observable.editing(false); })
                .on('keydown', this.onInputKeyDown.bind(this))
                .val(toNumString(observable(), this._base, this._padding))
                .appendTo($element.offsetParent())[0];
            this._input.focus();
            this._input.select();
        },
        leaveEditing: function () {
            if (!this._input) 
                return;

            $(this._input).remove();
            if (this._initialFocusElement) {
                this._initialFocusElement.focus();
            }
            this._input = undefined;
            this._initialFocusElement = undefined;
        },
        onInputKeyDown: function (e) {
            var observable = this._valueAccessor();
            switch (e.which) {
                case 13: {
                    var value = fromNumString(
                        $(e.target).val().replace(/^\s+|\s+$/g, ''), 
                        this._base, 
                        this._mask);
                    if (!isNaN(value)) {
                        observable(value);
                    }
                    observable.editing(false);
                    break;
                }

                case 27: 
                    observable.editing(false);
                    break;

                default:
                    var which = e.which;
                    var isPrintable = 
                        (which == 0x20)
                        || (which >= 0x30 && which <= 0x39) 
                        || (which >= 0x41 && which <= 0x5A) 
                        || (which >= 0x60 && which <= 0x69)
                        || (which >= 0xBA && which <= 0xC0)
                        || (which >= 0xDB && which <= 0xDE);
                    
                    if (isPrintable && !e.ctrlKey && !e.altKey && !e.metaKey && this._allowedKeyCodes.indexOf(which) < 0) {
                        e.preventDefault();
                    }
                    break;                    
            }
            e.stopPropagation();
        },
        onElementDispose: function () {
            var observable = this._valueAccessor();
            observable.editing(false);
            this.leaveEditing();
            if (this._editingSubscription) {
                this._editingSubscription.dispose();
                this._editingSubscription = undefined;
            }
        }
    };
    NumericBindingHandler.assign = function (element, handler) {
        ko.utils.domData.set(element, '_bh_editable', handler);
    };
    NumericBindingHandler.get = function (element) {
        return ko.utils.domData.get(element, '_bh_editable');
    };
    
    function EditableBindingHandler(element, valueAccessor) {
        this._element = element;
        this._valueAccessor = valueAccessor;
        this._value = undefined;
        this._editingSubscription = undefined;
        this._input = undefined;
        this._initialFocusElement = undefined;
    };
    EditableBindingHandler.prototype = {
        initOrUpdate: function (init) {
            var valueOrObservable = this._valueAccessor();
            var value = undefined;
            var editable = false;
            if (ko.isObservable(valueOrObservable)) {
                value = valueOrObservable();
                editable = ko.unwrap(valueOrObservable.editable) || false;
                if (init) {
                    valueOrObservable.editing = ko.observable(false);
                    this._editingSubscription = valueOrObservable.editing.subscribe(this.onEditingChange, this);
                    ko.utils.domNodeDisposal.addDisposeCallback(this._element, this.onElementDispose.bind(this));
                }
            }
            else {
                value = valueOrObservable;
            }

            if (value !== this._value) {
                this._value = value;
                ko.utils.setTextContent(this._element, value);
            }
            if (!editable && this._input) {
                valueOrObservable.editing(false);
            }
        },
        onEditingChange: function (editing) {
            if (editing)
                this.enterEditing();
            else
                this.leaveEditing();
        },
        enterEditing: function () {
            var observable = this._valueAccessor();
            var editable = observable && ko.unwrap(observable.editable) || false;
            if (!editable || this._input) 
                return;

            this._initialFocusElement = document.activeElement;
            var $element = $(this._element);
            var offset = $element.position();
            var width = $element.innerWidth();
            var height = $element.innerHeight();
            this._input = $('<input type="text" class="text-edit-control"></input>')
                .css({
                    top: offset.top + 'px',
                    left: offset.left + 'px',
                    width: width + 'px',
                    height: height + 'px'
                })
                .on('blur', function (e) { observable.editing(false); })
                .on('keydown', this.onInputKeyDown.bind(this))
                .val(observable())
                .appendTo($element.offsetParent())[0];
            this._input.focus();
            this._input.select();
        },
        leaveEditing: function () {
            if (!this._input) 
                return;

            $(this._input).remove();
            if (this._initialFocusElement) {
                this._initialFocusElement.focus();
            }
            this._input = undefined;
            this._initialFocusElement = undefined;
        },
        onInputKeyDown: function (e) {
            var observable = this._valueAccessor();
            switch (e.which) {
                case 13: {
                    var value = $(e.target).val().replace(/^\s+|\s+$/g, '');
                    observable(value);
                    observable.editing(false);
                    break;
                }
                case 27: 
                    observable.editing(false);
                    break;
            }
            e.stopPropagation();
        },
        onElementDispose: function () {
            var observable = this._valueAccessor();
            observable.editing(false);
            this.leaveEditing();
            if (this._editingSubscription) {
                this._editingSubscription.dispose();
                this._editingSubscription = undefined;
            }
        }
    };

    EditableBindingHandler.assign = function (element, handler) {
        ko.utils.domData.set(element, '_bh_editable', handler);
    };

    EditableBindingHandler.get = function (element) {
        return ko.utils.domData.get(element, '_bh_editable');
    };

    var bindingHandlerFactory = {
        createNumericBindingHandler: function (base, digits) {
            var padding = '';
            var mask = 0;
            for ( var i = 0; i < digits; i++ ) {
                padding += '0';
                mask = (mask * base) + (base - 1);
            }
            var allowedKeyCodes = [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46].slice(0, base)
                .concat([0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69].slice(0, base));
    
            return {
                init: function (element, valueAccessor) {
                    var handler = new NumericBindingHandler(element, valueAccessor, base, digits, padding, mask, allowedKeyCodes);
                    NumericBindingHandler.assign(element, handler);
                    handler.initOrUpdate(true);
                },
                update: function (element) {
                    var handler = NumericBindingHandler.get(element);
                    handler.initOrUpdate();
                }
            };
        },
        createEditableBindingHandler: function () {
            return {
                init: function (element, valueAccessor) { 
                    var handler = new EditableBindingHandler(element, valueAccessor);
                    EditableBindingHandler.assign(element, handler);
                    handler.initOrUpdate(true);
                },
                update: function (element) { 
                    var handler = EditableBindingHandler.get(element);
                    handler.initOrUpdate();
                }
            };
        }
    };

    function createSymbolsBindingHandler() {
        var symbolsMap = 
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7'+
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7'+
            ' !"#$%&\'()*+,-./'+
            '0123456789:;<=>?'+
            '@ABCDEFGHIJKLMNO'+
            'PQRSTUVWXYZ[\\]↑_'+
            '£abcdefghijklmno'+
            'pqrstuvwxyz{|}~©'+
            '\xb7\u255a\u255d\u2569\u2554\u2560\xb7\xb7\u2557\xb7\u2563\xb7\u2556\xb7\xb7\u256c'+
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7'+
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7'+
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7'+
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7'+
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7'+
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7'+
            '\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7\xb7';

        function initOrUpdateBinding(element, valueAccessor, init) {
            var byteArr = ko.unwrap(valueAccessor());
            var symbolArr = new Array(byteArr.length);
            for ( var i = 0; i < byteArr.length; i++ ){
                symbolArr[i] = symbolsMap.charAt(ko.unwrap(byteArr[i]));
            }
            var value = symbolArr.join('');
            if (ko.utils.domData.get(element, 'last_symbols') !== value) {
                ko.utils.setTextContent(element, value);
                ko.utils.domData.set(element, 'last_symbols', value);
            }
        }

        return {
            init: function (element, valueAccessor) { initOrUpdateBinding(element, valueAccessor, true); },
            update: function (element, valueAccessor) { initOrUpdateBinding(element, valueAccessor, false); }
        }; 
    }

    ko.bindingHandlers.hex16 = bindingHandlerFactory.createNumericBindingHandler(16, 4);
    ko.bindingHandlers.hex8 = bindingHandlerFactory.createNumericBindingHandler(16, 2);
    ko.bindingHandlers.bit2 = bindingHandlerFactory.createNumericBindingHandler(2, 2);
    ko.bindingHandlers.bit1 = bindingHandlerFactory.createNumericBindingHandler(2, 1);
    ko.bindingHandlers.editable = bindingHandlerFactory.createEditableBindingHandler();
    ko.bindingHandlers.symbols = createSymbolsBindingHandler();
    ko.bindingHandlers.commandDispatcher = {
        init: function (element, valueAccessor) { 
            $(element)
                .attr('data-command-dispatcher', true)
                .data('command-dispatcher', ko.unwrap(valueAccessor()));
            ko.utils.domNodeDisposal.addDisposeCallback(element, function () { 
                $(element)
                    .attr('data-command-dispatcher', undefined)
                    .data('command-dispatcher', undefined);
            });
        }
    };
    ko.bindingHandlers.command = {
        init: function (element, valueAccessor) {
            var dispatcher = $(element).closest('[data-command-dispatcher="true"]').data('command-dispatcher');
            if (dispatcher) {
                $(element).prop('disable', dispatcher.availableCommands.orderedSearch(ko.unwrap(valueAccessor())) < 0);
                $(element).on('click', function () { dispatcher.fire(ko.unwrap(valueAccessor())); })
            }
        },
        update: function (element, valueAccessor) {
            var dispatcher = $(element).closest('[data-command-dispatcher="true"]').data('command-dispatcher');
            if (dispatcher) {
                $(element).prop('disable', dispatcher.availableCommands.orderedSearch(ko.unwrap(valueAccessor())) < 0);
            }
        }
    };
    ko.extenders.incdec = function (target) {
        target.inc = function (step, exclusiveEnd, reversion) {
            if (step === undefined) {
                step = 1;
            }
            var val = target() + step;
            if (exclusiveEnd !== undefined && val >= exclusiveEnd) {
                if (reversion !== undefined)
                    val = reversion;
                else
                    val = exclusiveEnd - 1;
            }
            target(val);
        };
        target.dec = function (step, inclusiveBegin, reversion) {
            if (step === undefined) {
                step = 1;
            }
            var val = target() - step;
            if (inclusiveBegin !== undefined && val < inclusiveBegin) {
                if (reversion !== undefined) 
                    val = reversion;
                else
                    val = inclusiveBegin;
            }
            target(val);
        }
        return target;
    };
    ko.extenders.ordered = function (target, params) {
        params = (typeof params === 'object') ? params : {};
        params.keyFn = params.keyFn || function (e) { return e; };

        target.orderedSearch = function (key) {
            return DebugUtils.orderedSearch(target(), key, params.keyFn, params.cmpFn);
        };
        target.orderedInsert = function () {
            for ( var i = 0; i < arguments.length; i++ ) {
                var index = DebugUtils.orderedSearch(target(), params.keyFn(arguments[i]), params.keyFn, params.cmpFn);
                if (index < 0) {
                    target.splice(-1 - index, 0, arguments[i]);
                }
                else if (!params.noThrow) {
                    throw new Error('The given key is already presented in the array.');
                }
            }
        };
        return target;
    };
})(window, ko, jQuery);
ko.extenders.numeric = function(target, precision) {
    //create a writable computed observable to intercept writes to our observable
    var result = ko.pureComputed({
        read: target,  //always return the original observables value
        write: function(newValue) {
            var current = target(),
                roundingMultiplier = Math.pow(10, precision),
                newValueAsNum = isNaN(newValue) ? 0 : +newValue,
                valueToWrite = Math.round(newValueAsNum * roundingMultiplier) / roundingMultiplier;

            //only write if it changed
            if (valueToWrite !== current) {
                target(valueToWrite);
            } else {
                //if the rounded value is the same, but a different value was written, force a notification for the current field
                if (newValue !== current) {
                    target.notifySubscribers(valueToWrite);
                }
            }
        }
    }).extend({ notify: 'always' });

    //initialize with current value to make sure it is rounded appropriately
    result(target());

    //return the new computed observable
    return result;
};

ko.bindingHandlers.slider = {
    init: function (element, valueAccessor, allBindings) {
        var min = allBindings.get('min');
        (typeof min === 'undefined') && (min = 0.0);
        var max = allBindings.get('max');
        (typeof max === 'undefined') && (max = 1.0);
        var step = allBindings.get('step');
        (typeof step === 'undefined') && (step = 0.05);
        var value = valueAccessor();
        $(element).slider({
            min: min,
            max: max,
            step: step,
            value: ko.unwrap(value),
            slide: function (event, ui) {
                if (ko.isObservable(value)) {
                    value(ui.value);
                }
            }
        });
    },
    update: function (element, valueAccessor) {
        $(element).slider('value', ko.unwrap(valueAccessor()));
    }
};

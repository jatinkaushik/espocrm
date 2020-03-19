/************************************************************************
 * This file is part of EspoCRM.
 *
 * EspoCRM - Open Source CRM application.
 * Copyright (C) 2014-2020 Yuri Kuznetsov, Taras Machyshyn, Oleksiy Avramenko
 * Website: https://www.espocrm.com
 *
 * EspoCRM is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * EspoCRM is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EspoCRM. If not, see http://www.gnu.org/licenses/.
 *
 * The interactive user interfaces in modified source and object code versions
 * of this program must display Appropriate Legal Notices, as required under
 * Section 5 of the GNU General Public License version 3.
 *
 * In accordance with Section 7(b) of the GNU General Public License version 3,
 * these Appropriate Legal Notices must retain the display of the "EspoCRM" word.
 ************************************************************************/

define('crm:views/scheduler/scheduler', ['view'], function (Dep) {

    return Dep.extend({

        templateContent: '<div class="timeline"></div>' +
            '<link href="{{basePath}}client/modules/crm/css/vis.css" rel="stylesheet">',

        rangeMarginThreshold: 12 * 3600,

        leftMargin: 24 * 3600,

        rightMargin: 48 * 3600,

        rangeMultiplier: 4,

        setup: function () {
            this.startField = this.options.startField || 'dateStart';
            this.endField = this.options.endField || 'dateEnd';
            this.usersField = this.options.usersField || 'users';
            this.assignedUserField = this.options.assignedUserField || 'assignedUser';

            this.listenTo(this.model, 'change', function (m) {
                var isChanged =
                    m.hasChanged(this.startField) ||
                    m.hasChanged(this.endField) ||
                    m.hasChanged(this.usersField + 'Ids') ||
                    m.hasChanged(this.assignedUserField + 'Id');
                if (!isChanged) return;

                if (!m.hasChanged(this.assignedUserField + 'Id') && !m.hasChanged(this.usersField + 'Ids')) {
                    this.initDates(true);

                    if (!this.start || !this.end || !this.userIdList.length) {
                        this.trigger('no-data');
                        return;
                    }

                    if (this.timeline) {
                        this.updateEvent();

                        this.timeline.setWindow(
                            this.start.toDate(),
                            this.end.toDate()
                        );
                    }
                } else {
                    this.reRender();
                }
            }, this);
        },

        afterRender: function () {
            var $timeline = this.$timeline = this.$el.find('.timeline');

            require('lib!vis', function (Vis) {
                this.Vis = Vis;
                this.initGroupsDataSet();
                this.initDates();

                $timeline.get(0).innerHTML = '';

                if (!this.start || !this.end || !this.userIdList.length) {
                    this.trigger('no-data');
                    return;
                }

                this.trigger('has-data');

                this.fetch(this.start, this.end, function (eventList) {
                    var itemsDataSet = new Vis.DataSet(eventList);

                    var timeline = this.timeline = new Vis.Timeline($timeline.get(0), itemsDataSet, this.groupsDataSet, {
                        dataAttributes: 'all',
                        start: this.start.toDate(),
                        end: this.end.toDate(),
                        moment: function (date) {
                            var m = moment(date);
                            if (date && date.noTimeZone) {
                                return m;
                            }
                            return m.tz(this.getDateTime().getTimeZone());
                        }.bind(this),
                        format: this.getFormatObject(),
                        zoomable: false,
                        moveable: true,
                        orientation: 'top',
                        groupEditable: false,
                        editable: {
                            add: false,
                            updateTime: false,
                            updateGroup: false,
                            remove: false,
                        },
                        showCurrentTime: false,
                        locales: {
                            mylocale: {
                                current: this.translate('current', 'labels', 'Calendar'),
                                time: this.translate('time', 'labels', 'Calendar')
                            }
                        },
                        locale: 'mylocale',
                        margin: {
                            item: {
                                vertical: 12,
                            },
                            axis: 6,
                        },
                    });

                    timeline.on('rangechanged', function (e) {
                        e.skipClick = true;

                        this.blockClick = true;
                        setTimeout(function () {this.blockClick = false}.bind(this), 100);

                        this.start = moment(e.start);
                        this.end = moment(e.end);

                        this.updateRange();
                    }.bind(this));

                    this.once('render', function () {
                        timeline.destroy();
                    }, this);

                    this.once('remove', function () {
                        timeline.destroy();
                    }, this);

                }.bind(this));
            }.bind(this));
        },

        updateEvent: function () {
            var eventList = Espo.Utils.cloneDeep(this.busyEventList);
            this.addEvent(eventList);

            var itemsDataSet = new this.Vis.DataSet(eventList);
            this.timeline.setItems(itemsDataSet);
        },

        updateRange: function () {
            if (
                (this.start.unix() < this.fetchedStart.unix() + this.rangeMarginThreshold)
                ||
                (this.end.unix() > this.fetchedEnd.unix() - this.rangeMarginThreshold)
            ) {
                this.runFetch();
            }
        },

        initDates: function (update) {
            var startS = this.model.get(this.startField);
            var endS = this.model.get(this.endField);

            this.start = null;
            this.end = null;

            if (!startS || !endS) return;

            this.eventStart = moment.tz(startS, this.getDateTime().getTimeZone());
            this.eventEnd = moment.tz(endS, this.getDateTime().getTimeZone());

            this.start = this.eventStart.clone();
            this.end = this.eventEnd.clone();

            var diff = this.end.diff(this.start, 'hours');

            this.start.add(-diff * this.rangeMultiplier, 'hours');
            this.end.add(diff * this.rangeMultiplier, 'hours');

            this.start.startOf('hour');
            this.end.endOf('hour');

            if (!update) {
                this.fetchedStart = null;
                this.fetchedEnd = null;
            }
        },

        runFetch: function () {
            this.fetch(this.start, this.end, function (eventList) {
                var itemsDataSet = new this.Vis.DataSet(eventList);
                this.timeline.setItems(itemsDataSet);
            }.bind(this));
        },

        fetch: function (from, to, callback) {
            from = from.clone().add((-1) * this.leftMargin, 'seconds');
            to = to.clone().add(this.rightMargin, 'seconds');

            var fromString = from.utc().format(this.getDateTime().internalDateTimeFormat);
            var toString = to.utc().format(this.getDateTime().internalDateTimeFormat);

            var url = 'Activities/action/busyRanges?from=' + fromString + '&to=' + toString;

            url += '&userIdList=' + encodeURIComponent(this.userIdList.join(','));

            this.ajaxGetRequest(url).then(function (data) {
                this.fetchedStart = from.clone();
                this.fetchedEnd = to.clone();
                var eventList = [];

                for (var userId in data) {
                    data[userId].forEach(function (item) {
                        item.userId = userId;
                        item.isBusyRange = true;
                        eventList.push(item);
                    }, this);
                }

                var convertedEventList = this.convertEventList(eventList);

                this.busyEventList = Espo.Utils.cloneDeep(convertedEventList);
                this.addEvent(convertedEventList);

                callback(convertedEventList);

            }.bind(this));
        },

        addEvent: function (list) {
            var o = {
                type: 'point',
                start: this.eventStart.clone(),
                end: this.eventEnd.clone(),
                type: 'background',
                className: 'item',
            };

            this.userIdList.forEach(function (id) {
                var c = Espo.Utils.clone(o);
                c.group = id;
                list.push(c);
            }, this);
        },

        convertEventList: function (list) {
            var resultList = [];
            list.forEach(function (iten) {
                var event = this.convertEvent(iten);
                if (!event) return;
                resultList.push(event);
            }, this);
            return resultList;
        },

        convertEvent: function (o) {
            var event;

            if (o.isBusyRange) {
                event = {
                    className: 'busy',
                    group: o.userId,
                    'date-start': o.dateStart,
                    'date-end': o.dateEnd,
                    type: 'background',
                };
            }

            if (o.dateStart) {
                if (!o.dateStartDate) {
                    event.start = this.getDateTime().toMoment(o.dateStart);
                } else {
                    event.start = moment.tz(o.dateStartDate, this.getDateTime().getTimeZone());
                }
            }
            if (o.dateEnd) {
                if (!o.dateEndDate) {
                    event.end = this.getDateTime().toMoment(o.dateEnd);
                } else {
                    event.end = moment.tz(o.dateEndDate, this.getDateTime().getTimeZone());
                }
            }

            if (o.isBusyRange) {
                return event;
            }
        },

        initGroupsDataSet: function () {
            var list = [];

            var userIdList = Espo.Utils.clone(this.model.get(this.usersField + 'Ids') || []);
            var assignedUserId = this.model.get(this.assignedUserField + 'Id');

            var names = this.model.get(this.usersField + 'Names') || {};
            if (assignedUserId) {
                if (!~userIdList.indexOf(assignedUserId)) userIdList.unshift(assignedUserId);
                names[assignedUserId] = this.model.get(this.assignedUserField + 'Name');
            }

            this.userIdList = userIdList;

            userIdList.forEach(function (id, i) {
                list.push({
                    id: id,
                    content: this.getGroupContent(id, names[id] || id),
                    order: i,
                });
            }, this);

            this.groupsDataSet = new this.Vis.DataSet(list);
        },

        getGroupContent: function (id, name) {
            if (name) {
                name = this.getHelper().escapeString(name);
            }
            if (this.calendarType === 'single') {
                return name;
            }
            var avatarHtml = this.getAvatarHtml(id);
            if (avatarHtml) avatarHtml += ' ';
            var html = avatarHtml + '<span data-id="'+id+'" class="group-title">' + name + '</span>';

            return html;
        },

        getAvatarHtml: function (id) {
            if (this.getConfig().get('avatarsDisabled')) {
                return '';
            }
            var t;
            var cache = this.getCache();
            if (cache) {
                t = cache.get('app', 'timestamp');
            } else {
                t = Date.now();
            }

            return '<img class="avatar avatar-link" width="14"'+
                ' src="'+this.getBasePath()+'?entryPoint=avatar&size=small&id=' + id + '&t='+t+'">';
        },

        getFormatObject: function () {
            var format = {
                minorLabels: {
                    millisecond: 'SSS',
                    second: 's',
                    minute: this.getDateTime().getTimeFormat(),
                    hour: this.getDateTime().getTimeFormat(),
                    weekday: 'ddd D',
                    day: 'D',
                    month: 'MMM',
                    year: 'YYYY'
                },
                majorLabels: {
                    millisecond: this.getDateTime().getTimeFormat() + ' ss',
                    second: this.getDateTime().getReadableDateFormat() + ' HH:mm',
                    minute: 'ddd D MMMM',
                    hour: 'ddd D MMMM',
                    weekday: 'MMMM YYYY',
                    day: 'MMMM YYYY',
                    month: 'YYYY',
                    year: ''
                }
            };
            return format;
        },

    });
});

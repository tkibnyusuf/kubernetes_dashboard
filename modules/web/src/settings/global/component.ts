// Copyright 2017 The Kubernetes Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {HttpErrorResponse} from '@angular/common/http';
import {Component, DestroyRef, inject, OnInit} from '@angular/core';
import {UntypedFormBuilder, UntypedFormGroup} from '@angular/forms';
import {MatDialog} from '@angular/material/dialog';
import {GlobalSettings, NamespaceList} from '@api/root.api';
import isEqual from 'lodash-es/isEqual';
import {Observable, of} from 'rxjs';
import {catchError, take, tap} from 'rxjs/operators';

import {GlobalSettingsService} from '@common/services/global/globalsettings';
import {TitleService} from '@common/services/global/title';
import {ResourceService} from '@common/services/resource/resource';

import {SaveAnywayDialogComponent} from './saveanywaysdialog/dialog';
import {SettingsHelperService} from './service';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Controls as NamespaceControls} from './namespace/component';

enum Controls {
  ClusterName = 'clusterName',
  ItemsPerPage = 'itemsPerPage',
  LabelsLimit = 'labelsLimit',
  LogsAutorefreshInterval = 'logsAutorefreshInterval',
  ResourceAutorefreshInterval = 'resourceAutorefreshInterval',
  DisableAccessDeniedNotification = 'disableAccessDeniedNotification',
  NamespaceSettings = 'namespaceSettings',
}

@Component({
  selector: 'kd-global-settings',
  templateUrl: './template.html',
  styleUrls: ['style.scss'],
})
export class GlobalSettingsComponent implements OnInit {
  readonly Controls = Controls;

  settings: GlobalSettings = {} as GlobalSettings;
  hasLoadError = false;
  form: UntypedFormGroup;

  // Keep it in sync with ConcurrentSettingsChangeError constant from the backend.
  private readonly concurrentChangeErr_ = 'settings changed since last reload';

  private destroyRef = inject(DestroyRef);
  constructor(
    private readonly settingsService_: GlobalSettingsService,
    private readonly settingsHelperService_: SettingsHelperService,
    private readonly namespaceService_: ResourceService<NamespaceList>,
    private readonly dialog_: MatDialog,
    private readonly title_: TitleService,
    private readonly builder_: UntypedFormBuilder
  ) {}

  private get externalSettings_(): GlobalSettings {
    return {
      itemsPerPage: this.settingsService_.getItemsPerPage(),
      labelsLimit: this.settingsService_.getLabelsLimit(),
      clusterName: this.settingsService_.getClusterName(),
      logsAutoRefreshTimeInterval: this.settingsService_.getLogsAutoRefreshTimeInterval(),
      resourceAutoRefreshTimeInterval: this.settingsService_.getResourceAutoRefreshTimeInterval(),
      disableAccessDeniedNotifications: this.settingsService_.getDisableAccessDeniedNotifications(),
      defaultNamespace: this.settingsService_.getDefaultNamespace(),
      namespaceFallbackList: this.settingsService_.getNamespaceFallbackList(),
    };
  }

  ngOnInit(): void {
    this.form = this.builder_.group({
      [Controls.ClusterName]: this.builder_.control(''),
      [Controls.ItemsPerPage]: this.builder_.control(0),
      [Controls.LabelsLimit]: this.builder_.control(0),
      [Controls.LogsAutorefreshInterval]: this.builder_.control(0),
      [Controls.ResourceAutorefreshInterval]: this.builder_.control(0),
      [Controls.DisableAccessDeniedNotification]: this.builder_.control(false),
      [Controls.NamespaceSettings]: this.builder_.control({
        [NamespaceControls.DefaultNamespace]: this.externalSettings_.defaultNamespace,
        [NamespaceControls.FallbackList]: this.externalSettings_.namespaceFallbackList,
      }),
    });

    this.load_();
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(this.onFormChange_.bind(this));
    this.settingsHelperService_.onSettingsChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => (this.settings = s));
  }

  isInitialized(): boolean {
    return this.settingsService_.isInitialized();
  }

  reload(): void {
    this.form.reset();
    this.settingsHelperService_.reset();
    this.load_();
  }

  canSave(): boolean {
    return !isEqual(this.settings, this.externalSettings_) && !this.hasLoadError;
  }

  save(): void {
    this.settingsService_
      .save(this.settings)
      .pipe(
        tap(_ => {
          this.load_();
          this.title_.update();
          this.settingsService_.onSettingsUpdate.next();
        })
      )
      .pipe(catchError(this.onSaveError_.bind(this)))
      .pipe(take(1))
      .subscribe(this.onSave_.bind(this));
  }

  private onSave_(result: GlobalSettings | boolean): void {
    if (result === true) {
      this.save();
    }

    this.reload();
  }

  private onSaveError_(err: HttpErrorResponse): Observable<boolean> {
    if (err && err.error.indexOf(this.concurrentChangeErr_) !== -1) {
      return this.dialog_.open(SaveAnywayDialogComponent, {width: '420px'}).afterClosed();
    }

    return of(false);
  }

  private load_(): void {
    this.settingsService_
      .canI()
      .pipe(take(1))
      .subscribe(canI => (this.hasLoadError = !canI));
    this.settingsService_.load(this.onLoad_.bind(this), this.onLoadError_.bind(this));
  }

  private onLoad_(): void {
    this.settings = this.externalSettings_;
    this.settingsHelperService_.settings = this.settings;

    this.form.get(Controls.ItemsPerPage).setValue(this.settings.itemsPerPage, {emitEvent: false});
    this.form.get(Controls.LabelsLimit).setValue(this.settings.labelsLimit, {emitEvent: false});
    this.form.get(Controls.ClusterName).setValue(this.settings.clusterName, {emitEvent: false});
    this.form
      .get(Controls.LogsAutorefreshInterval)
      .setValue(this.settings.logsAutoRefreshTimeInterval, {emitEvent: false});
    this.form
      .get(Controls.ResourceAutorefreshInterval)
      .setValue(this.settings.resourceAutoRefreshTimeInterval, {emitEvent: false});
    this.form
      .get(Controls.DisableAccessDeniedNotification)
      .setValue(this.settings.disableAccessDeniedNotifications, {emitEvent: false});
  }

  private onLoadError_(): void {
    this.hasLoadError = true;
  }

  private onFormChange_(): void {
    this.settingsHelperService_.settings = {
      itemsPerPage: this.form.get(Controls.ItemsPerPage).value,
      clusterName: this.form.get(Controls.ClusterName).value,
      disableAccessDeniedNotifications: this.form.get(Controls.DisableAccessDeniedNotification).value,
      labelsLimit: this.form.get(Controls.LabelsLimit).value,
      logsAutoRefreshTimeInterval: this.form.get(Controls.LogsAutorefreshInterval).value,
      resourceAutoRefreshTimeInterval: this.form.get(Controls.ResourceAutorefreshInterval).value,
    } as GlobalSettings;
  }
}

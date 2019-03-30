import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { HomeComponent } from './HomeManagement/HomeComponent/home.component';
import { UserInputComponent } from './HomeManagement/user-input/user.input.component';
import { UserListComponent } from './HomeManagement/user-list/user-list.component';
import { UserDetailsComponent } from './HomeManagement/user-details/user.details.component';
import { EaselComponent } from './HomeManagement/easel/easel.component';
import { PieceComponent } from './HomeManagement/piece/piece.component';

@NgModule({
  declarations: [
    HomeComponent,
    UserInputComponent,
    UserListComponent,
    UserDetailsComponent,
    EaselComponent,
    PieceComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule
  ],
  providers: [],
  bootstrap: [HomeComponent]
})
export class AppModule { }

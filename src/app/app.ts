import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './shared/navbar/navbar';
import { LocalizedContentDirective } from './shared/localized-content.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, LocalizedContentDirective],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {

}

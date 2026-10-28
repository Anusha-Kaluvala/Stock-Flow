# StockFlow Inventory Management System

## Project Description

StockFlow is a lightweight inventory management application designed to help small businesses manage products, monitor stock levels, and identify low-stock items. It provides a simple dashboard and essential inventory management features through a user-friendly interface.

## Features

User Registration and Login

Secure user registration and login functionality.

Organization Management

Maintains separate inventory data for each organization.

Product Management

Allows users to add, view, edit, and delete products.

SKU Tracking

Assigns a unique SKU to each product within an organization.

Stock Monitoring

Tracks product quantities and available stock levels.

Low Stock Detection

Identifies products whose quantities are less than or equal to the configured low-stock threshold.

Dashboard

Displays the total number of products, total stock quantity, and low-stock items.

Settings

Allows users to configure the default low-stock threshold.

## Technologies Used

Backend: Node.js and Express.js

Database: SQLite and Better-SQLite3

Authentication: JSON Web Token and bcryptjs

Frontend: HTML, CSS, and JavaScript

## Prerequisites

Node.js version 18 or later

npm package manager

A modern web browser such as Google Chrome or Microsoft Edge

## Installation and Setup

Step 1: Clone the repository.

git clone your-repository-url

Step 2: Navigate to the project directory.

cd stockflow

Step 3: Install the dependencies.

npm install

Step 4: Start the development server.

npm run dev

Alternatively, start the application using the following command.

npm start

Step 5: Open the application in your browser.

http://localhost:3000

Register an account or log in to begin managing inventory.

## Product Information

Each product contains a name, SKU, description, available quantity, low-stock threshold, cost price, and selling price.

## Dashboard Overview

The dashboard provides an overview of inventory by displaying the total number of products, total quantity of items in stock, and the number of low-stock products.

A product is considered low stock when its available quantity is less than or equal to its applicable threshold.

## Project Structure

stockflow

public contains the frontend files

db.js contains database configuration and operations

server.js contains the Express server and backend routes

package.json contains project configuration and dependencies

package-lock.json records dependency versions

README.md contains project documentation

## Security and Data Isolation

Passwords are hashed before storage.

Authentication uses JSON Web Tokens.

Inventory data should be accessible only to authorized users belonging to the relevant organization.

SKU values must be unique within each organization.

## Project Scope

StockFlow focuses on the essential features required for a minimum viable product.

Multi-warehouse management, product variants, third-party integrations, order management, supplier management, email notifications, CSV imports, external API access, advanced role-based access control, audit logs, detailed stock movement history, and billing management are outside the scope of this version.

## Future Enhancements

Future improvements may include advanced inventory reports, bulk product imports, supplier management, stock movement history, and third-party integrations.

## Author

Developed as a software development project to demonstrate inventory management, backend development, database integration, and user authentication.

## License

This project is intended for educational and demonstration purposes. A suitable license can be added if the project is distributed publicly.
